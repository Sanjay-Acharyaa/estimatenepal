"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Stage, Layer, Image as KonvaImage, Rect, Line, Text, Group, Circle, Path, Arrow, RegularPolygon, Star } from "react-konva";
import Konva from "konva";
import * as pdfjsLib from "pdfjs-dist";
import { computeScale, scaleLabel } from "@/lib/scale";
import { effectiveScale } from "@/lib/takeoff";
import { DrawingScalePanel } from "./DrawingScalePanel";
import { ScaleZonePanel } from "./ScaleZonePanel";
import { TakeoffPanel, type TakeoffGroup } from "./TakeoffPanel";
import { EstimateTabBar } from "./EstimateTabBar";
import { TakeoffItemDetail } from "./TakeoffItemDetail";
import type { TakeoffItem, Annotation } from "./types";
import { getSocket, roomId } from "@/lib/socket";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ScaleZone = { id: string; label: string | null; scale: number; scaleUnit: string; x: number; y: number; width: number; height: number };
type DrawingPage = { id: string; pageNumber: number; label: string | null; scale: number | null; scaleUnit: string; canvasJson: Record<string, unknown> | null; annotationsJson: Record<string, unknown> | null; scaleZones: ScaleZone[] };
type DrawingData = { id: string; fileName: string; downloadUrl: string; pages: DrawingPage[] };
type Point = { x: number; y: number };

export type { TakeoffItem } from "./types";

export type Discipline = {
  id: string;
  name: string;
  sortOrder: number;
  isPrimary: boolean;
  _count: { groups: number };
};

type Props = {
  projectId: string;
  drawing: DrawingData;
  unitSystem: string;
  initialGroups: TakeoffGroup[];
  initialDisciplines: Discipline[];
  allDrawings: { id: string; fileName: string; folderId?: string | null; folderName?: string }[];
  currentUser: { id: string; name: string };
};

type ActiveUser = { socketId: string; userId: string; name: string; initials: string };

type Mode = "select" | "calibrate" | "zone" | "polyline" | "rectangle" | "circle" | "arc" | "count" | "measure" | "pen" | "markup-text" | "highlight" | "arrow" | "xline";

const DEBOUNCE_MS = 1000;
const SEL = "#38BDF8"; // selection highlight — sky-400, visible on white PDF and dark canvas

const AVATAR_BG = ["bg-purple-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-indigo-500", "bg-rose-500"];
function avatarBg(id: string): string {
  let h = 0;
  for (const c of id) h = ((h << 5) - h + c.charCodeAt(0)) & 0xffffff;
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}
const AVATAR_HEX = ["#a855f7", "#10b981", "#f59e0b", "#ec4899", "#6366f1", "#f43f5e"];
function avatarHex(id: string): string {
  let h = 0;
  for (const c of id) h = ((h << 5) - h + c.charCodeAt(0)) & 0xffffff;
  return AVATAR_HEX[Math.abs(h) % AVATAR_HEX.length];
}

/** Convert decimal feet to feet-inches string: 1.333… → "1'-4"" */
function ftToFeetIn(ft: number): string {
  const totalIn = Math.round(Math.abs(ft) * 12);
  const feet = Math.floor(totalIn / 12);
  const inches = totalIn % 12;
  if (feet === 0) return `${inches}"`;
  if (inches === 0) return `${feet}'`;
  return `${feet}'-${inches}"`;
}
const SNAP_RADIUS = 8;
const MAX_HISTORY = 30;

// ─── Component ────────────────────────────────────────────────────────────────

export function DrawingCanvas({ projectId, drawing, unitSystem, initialGroups, initialDisciplines, allDrawings, currentUser }: Props) {
  // PDF state
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [pdfImage, setPdfImage] = useState<HTMLImageElement | null>(null);
  const [pdfDims, setPdfDims] = useState({ width: 0, height: 0 });
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState("");

  // Viewport
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  // Pages
  const [pages, setPages] = useState<DrawingPage[]>(drawing.pages);
  const currentPage = pages[currentPageIdx];

  // Mode
  const [mode, setMode] = useState<Mode>("select");

  // Calibration
  const [calibLine, setCalibLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [calibStep, setCalibStep] = useState<"draw" | "input">("draw");
  const calibAnchor = useRef<Point | null>(null);
  const [calibPanelMode, setCalibPanelMode] = useState<"common" | "manual">("common");

  // Zone drawing
  const [zoneRect, setZoneRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [showZonePanel, setShowZonePanel] = useState(false);
  const zoneDragStart = useRef<Point | null>(null);

  // Manual pan (right/middle button in any mode, left button in select mode)
  const isPanningRef = useRef(false);
  const panStartClientRef = useRef<{ x: number; y: number } | null>(null);
  const panStartStagePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Disciplines (tabs)
  // Persist last-visited drawing so TakeoffTabRedirect can restore it
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`lastDrawing:${projectId}`, drawing.id);
    }
  }, [projectId, drawing.id]);

  const [disciplines, setDisciplines] = useState<Discipline[]>(initialDisciplines);
  const [activeDisciplineId, setActiveDisciplineId] = useState<string | null>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(`active-discipline-${projectId}`) : null;
    const validIds = new Set(initialDisciplines.map(d => d.id));
    if (stored && validIds.has(stored)) return stored;
    return initialDisciplines.find((d) => d.isPrimary)?.id ?? initialDisciplines[0]?.id ?? null;
  });

  // Takeoff groups
  const [takeoffGroups, setTakeoffGroups] = useState<TakeoffGroup[]>(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Takeoff items (current page)
  const [takeoffItems, setTakeoffItems] = useState<TakeoffItem[]>([]);
  const [itemsLoadError, setItemsLoadError] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  // All-pages totals per group (fetched from server, refreshed after add/delete)
  const [allPageGroupTotals, setAllPageGroupTotals] = useState<Record<string, { rawQty: number; unit: string; count: number }>>({});

  // NRS totals per discipline tab
  const [disciplineTotals, setDisciplineTotals] = useState<Record<string, number>>({});

  // Page activity indicators: { [pageId]: { hasAnnotations, hasTakeoff } }
  const [pageActivity, setPageActivity] = useState<Record<string, { hasAnnotations: boolean; hasTakeoff: boolean }>>({});

  useEffect(() => {
    fetch(`/api/projects/${projectId}/drawings/page-activity`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPageActivity(d); })
      .catch(() => {});
  }, []); // eslint-disable-line

  // Drawing selector dropdown state
  const [showDrawingSelector, setShowDrawingSelector] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Linear tool — keep a ref so event handlers always see latest points (stale closure fix)
  const [linearPoints, setLinearPoints] = useState<Point[]>([]);
  const linearPointsRef = useRef<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [snapPoint, setSnapPoint] = useState<Point | null>(null);
  const [snapCandidate, setSnapCandidate] = useState<{ point: Point; type: string } | null>(null);
  const [pdfSnapPoints, setPdfSnapPoints] = useState<{ point: Point; type: string }[]>([]);

  // Rectangle tool (drag to draw)
  const areaDragStart = useRef<Point | null>(null);
  const [areaRect, setAreaRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Circle tool: click center → drag to radius → release to save
  const circleCenterRef = useRef<Point | null>(null);
  const [circlePreview, setCirclePreview] = useState<{ cx: number; cy: number; r: number } | null>(null);

  // Arc tool: 3 clicks — start, end, midpoint-on-arc → save
  const arcPointsRef = useRef<Point[]>([]);
  const [arcPoints, setArcPoints] = useState<Point[]>([]);

  // Node editing: drag a vertex of a saved shape to reposition it
  const [nodeEditState, setNodeEditState] = useState<{ itemId: string; pts: Point[] } | null>(null);
  const nodeEditRef = useRef<{ itemId: string; pts: Point[] } | null>(null);

  // Rubber-band multi-selection (Shift+drag on canvas background)
  const rubberBandStart = useRef<Point | null>(null);
  const isRubberBandingRef = useRef(false);
  const [rubberBand, setRubberBand] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const v = localStorage.getItem("takeoff-sidebar-width");
      return v ? Math.max(180, Math.min(480, parseInt(v, 10))) : 224;
    }
    return 224;
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") return window.innerWidth >= 768;
    return true;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarResizeStartX = useRef(0);
  const sidebarResizeStartW = useRef(224);

  // Touch pan/zoom refs
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef(1);
  const touchStartMidRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  function handleSidebarResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    sidebarResizeStartX.current = e.clientX;
    sidebarResizeStartW.current = sidebarWidth;
    setIsResizingSidebar(true);
    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - sidebarResizeStartX.current;
      const next = Math.max(180, Math.min(480, sidebarResizeStartW.current + delta));
      setSidebarWidth(next);
    }
    function onUp() {
      setIsResizingSidebar(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      localStorage.setItem("takeoff-sidebar-width", String(Math.max(180, Math.min(480, sidebarResizeStartW.current))));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleTouchStart(e: Konva.KonvaEventObject<TouchEvent>) {
    const touches = e.evt.touches;
    if (touches.length === 2) {
      // Pinch-zoom: record initial finger distance and stage state
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      touchStartDistRef.current = Math.hypot(dx, dy);
      touchStartScaleRef.current = scale;
      touchStartMidRef.current = {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      };
      touchStartPosRef.current = { ...stagePos };
    } else if (touches.length === 1) {
      // Single-finger pan
      isPanningRef.current = true;
      panStartClientRef.current = { x: touches[0].clientX, y: touches[0].clientY };
      panStartStagePosRef.current = { ...stagePos };
    }
  }

  function handleTouchMove(e: Konva.KonvaEventObject<TouchEvent>) {
    e.evt.preventDefault();
    const touches = e.evt.touches;
    const stage = e.target.getStage();
    if (!stage) return;

    if (touches.length === 2 && touchStartDistRef.current !== null && touchStartMidRef.current) {
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.max(0.05, Math.min(20, touchStartScaleRef.current * (dist / touchStartDistRef.current)));
      const mid = touchStartMidRef.current;
      const container = containerRef.current?.getBoundingClientRect();
      if (container) {
        const stageX = mid.x - container.left;
        const stageY = mid.y - container.top;
        const newX = stageX - (stageX - touchStartPosRef.current.x) * (newScale / touchStartScaleRef.current);
        const newY = stageY - (stageY - touchStartPosRef.current.y) * (newScale / touchStartScaleRef.current);
        setScale(newScale);
        setStagePos({ x: newX, y: newY });
        stage.x(newX); stage.y(newY); stage.scaleX(newScale); stage.scaleY(newScale);
      }
    } else if (touches.length === 1 && isPanningRef.current && panStartClientRef.current) {
      const dx = touches[0].clientX - panStartClientRef.current.x;
      const dy = touches[0].clientY - panStartClientRef.current.y;
      const newX = panStartStagePosRef.current.x + dx;
      const newY = panStartStagePosRef.current.y + dy;
      setStagePos({ x: newX, y: newY });
      stage.x(newX); stage.y(newY);
    }
  }

  function handleTouchEnd() {
    isPanningRef.current = false;
    panStartClientRef.current = null;
    touchStartDistRef.current = null;
    touchStartMidRef.current = null;
  }

  // Ref mirrors — keyboard/event handlers must never read stale closures
  const selectedItemIdsRef = useRef<Set<string>>(new Set());
  const takeoffItemsRef = useRef<TakeoffItem[]>([]);
  const takeoffGroupsRef = useRef<TakeoffGroup[]>([]);
  const selectedMeasurementIdsRef = useRef<Set<string>>(new Set());

  // Track Shift key state — more reliable than isShiftHeld.current in Konva
  const isShiftHeld = useRef(false);
  const [shiftActive, setShiftActive] = useState(false); // reactive mirror for JSX rendering

  // Undo/redo history (list of item arrays)
  const historyRef = useRef<TakeoffItem[][]>([]);
  const historyIdxRef = useRef(-1);

  // Save debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportReady = useRef(false);

  // Double-click detection
  const lastClickTime = useRef(0);
  const lastClickImgPos = useRef<Point | null>(null);

  // Measure tool: accumulates multiple rulers — no layer, no quantity contribution, never saved
  const [measurements, setMeasurements] = useState<{ id: string; start: Point; end: Point }[]>([]);
  const [measureAnchor, setMeasureAnchor] = useState<Point | null>(null);
  const measureCountRef = useRef(0);
  const [selectedMeasurementIds, setSelectedMeasurementIds] = useState<Set<string>>(new Set());
  const [measureNodeEdit, setMeasureNodeEdit] = useState<{ id: string; start: Point; end: Point } | null>(null);
  const measureNodeEditRef = useRef<{ id: string; start: Point; end: Point } | null>(null);

  // Per-item detail panel
  const [detailItem, setDetailItem] = useState<TakeoffItem | null>(null);

  // ─── Markup / annotation state ────────────────────────────────────────────
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annotationsRef = useRef<Annotation[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<Set<string>>(new Set());
  const selectedAnnotationIdsRef = useRef<Set<string>>(new Set());
  const [markupColor, setMarkupColor] = useState("#EF4444");
  const [markupStrokeWidth, setMarkupStrokeWidth] = useState(2);
  const annotationCountRef = useRef(0);
  const annotationHistoryRef = useRef<Annotation[][]>([[]]);
  const annotationHistoryIdxRef = useRef(0);

  // In-progress markup drafts
  const penDraftRef = useRef<number[]>([]);
  const isPenDrawingRef = useRef(false);
  const [penDraft, setPenDraft] = useState<number[] | null>(null);
  const [arrowDraft, setArrowDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const arrowStartRef = useRef<Point | null>(null);
  const [xlineDraft, setXlineDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const xlineStartRef = useRef<Point | null>(null);
  const [highlightDraft, setHighlightDraft] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const highlightStartRef = useRef<Point | null>(null);
  const [textInput, setTextInput] = useState<{ imgX: number; imgY: number; value: string } | null>(null);

  // Debounced annotation save timer
  const annSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Real-time presence — other users viewing the same page
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  // Socket connection status
  const [socketConnected, setSocketConnected] = useState(true);
  const hasConnectedOnceRef = useRef(false);

  // Lock-on-select — items currently being edited by another user
  const [shapeLocks, setShapeLocks] = useState<Map<string, { userId: string; name: string }>>(new Map());

  // Keep refs in sync so stale-closure handlers always read latest values
  selectedItemIdsRef.current = selectedItemIds;
  takeoffItemsRef.current = takeoffItems;
  takeoffGroupsRef.current = takeoffGroups;
  selectedMeasurementIdsRef.current = selectedMeasurementIds;
  selectedAnnotationIdsRef.current = selectedAnnotationIds;

  // ─── Resize observer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setStageSize({ width: Math.max(width, 400), height: Math.max(height, 400) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Flag: was the latest selectedGroupId change triggered by clicking a canvas shape?
  // If so, don't auto-switch the drawing tool — just highlight the layer in the panel.
  const shapeTriggeredGroupSelect = useRef(false);

  // ─── Track Shift key ─────────────────────────────────────────────────
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.key === "Shift") { isShiftHeld.current = true; setShiftActive(true); } };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") { isShiftHeld.current = false; setShiftActive(false); } };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  // ─── Auto-switch tool when layer selection changes ───────────────────
  useEffect(() => {
    if (!selectedGroupId) return;
    if (shapeTriggeredGroupSelect.current) {
      shapeTriggeredGroupSelect.current = false;
      return; // Just highlighting, don't change drawing tool
    }
    const group = takeoffGroups.find(g => g.id === selectedGroupId);
    if (!group) return;
    resetDrawingState();
    // Locked layer → stay in select mode, never auto-switch to a drawing tool
    if (group.isLocked) { setMode("select"); return; }
    setMode(group.type === "COUNT" ? "count" : "polyline");
  }, [selectedGroupId]); // eslint-disable-line

  // ─── Sync canvas shape selection → layer highlight in left panel ─────
  useEffect(() => {
    if (selectedItemIds.size !== 1) return; // Only sync on single selection
    const [id] = Array.from(selectedItemIds);
    const item = takeoffItems.find(i => i.id === id);
    if (!item?.groupId || item.groupId === selectedGroupId) return;
    shapeTriggeredGroupSelect.current = true;
    setSelectedGroupId(item.groupId);
  }, [selectedItemIds]); // eslint-disable-line

  // ─── Socket reconnect: track connection status + re-fetch items on reconnect ──
  useEffect(() => {
    const socket = getSocket(currentUser);

    function onConnect() {
      setSocketConnected(true);
      if (hasConnectedOnceRef.current) {
        // This is a reconnect — refresh items to catch up on missed events
        refreshItems();
      }
      hasConnectedOnceRef.current = true;
    }

    function onDisconnect() { setSocketConnected(false); }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => { socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); };
  }, [currentPage?.id]); // eslint-disable-line

  // ─── Lock-on-select: emit shape:lock when 1 item selected, unlock on deselect ──
  useEffect(() => {
    if (!currentPage || !activeDisciplineId || selectedItemIds.size !== 1 || mode !== "select") return;
    const [itemId] = Array.from(selectedItemIds);
    const room = roomId(activeDisciplineId, currentPage.id);
    const socket = getSocket(currentUser);
    socket.emit("shape:lock", { roomId: room, itemId });
    return () => { socket.emit("shape:unlock", { roomId: room, itemId }); };
  }, [selectedItemIds, mode, currentPage?.id, activeDisciplineId]); // eslint-disable-line

  // ─── Load annotations when page changes ──────────────────────────────
  useEffect(() => {
    const stored = currentPage.annotationsJson as { annotations?: Annotation[] } | null;
    const loaded = stored?.annotations ?? [];
    annotationsRef.current = loaded;
    setAnnotations(loaded);
    setSelectedAnnotationIds(new Set());
    annotationHistoryRef.current = [loaded];
    annotationHistoryIdxRef.current = 0;
    annotationCountRef.current = loaded.length;
  }, [currentPage?.id]); // eslint-disable-line

  // ─── Load / refresh takeoff items ────────────────────────────────────
  function refreshItems() {
    if (!currentPage) return;
    fetch(`/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/takeoff-items?limit=200`)
      .then(async (r) => {
        if (!r.ok) {
          console.error("[takeoff] refreshItems fetch failed", r.status, await r.text().catch(() => ""));
          return;
        }
        const d = await r.json();
        const items = d.data ?? [];
        setTakeoffItems(items);
        historyRef.current = [items];
        historyIdxRef.current = 0;
      })
      .catch((err) => console.error("[takeoff] refreshItems network error", err));
  }

  // Called after a copy-with-shapes: appends the server-created items directly.
  // Filters to the current page — the copy API returns items from ALL pages.
  function appendCopiedItems(newItems: unknown[]) {
    if (!newItems || newItems.length === 0) return;
    const typed = newItems as TakeoffItem[];
    const forThisPage = typed.filter(i => i.pageId === currentPage?.id);
    if (forThisPage.length === 0) return;
    const merged = [...takeoffItemsRef.current, ...forThisPage];
    setTakeoffItems(merged);
    historyRef.current[historyIdxRef.current] = merged;
  }

  function refreshAllPageTotals() {
    fetch(`/api/projects/${projectId}/takeoff-groups/totals`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setAllPageGroupTotals(d); })
      .catch(() => {});
  }

  function refreshDisciplineTotals() {
    fetch(`/api/projects/${projectId}/disciplines/totals`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setDisciplineTotals(d); })
      .catch(() => {});
  }

  // Re-fetches ALL takeoff groups from the server — needed after discipline copy
  // because copied groups exist only in the DB, not in client state.
  function refreshGroups() {
    fetch(`/api/projects/${projectId}/takeoff-groups`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (Array.isArray(d)) setTakeoffGroups(d); })
      .catch(() => {});
  }

  useEffect(() => { refreshAllPageTotals(); refreshDisciplineTotals(); }, []); // eslint-disable-line

  useEffect(() => {
    if (!currentPage) return;
    setLoadingItems(true);
    setItemsLoadError(null);
    fetch(`/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/takeoff-items?limit=200`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          const msg = `Failed to load shapes (HTTP ${r.status})`;
          console.error("[takeoff] items fetch failed", r.status, body);
          setItemsLoadError(msg);
          return;
        }
        const d = await r.json();
        const items = d.data ?? [];
        setTakeoffItems(items);
        historyRef.current = [items];
        historyIdxRef.current = 0;
      })
      .catch((err) => {
        console.error("[takeoff] items fetch network error", err);
        setItemsLoadError("Network error — could not load shapes.");
      })
      .finally(() => setLoadingItems(false));
  }, [currentPage?.id]); // eslint-disable-line

  // ─── Socket.io — join/leave room, sync shapes with other users ────────
  useEffect(() => {
    if (!currentPage || !activeDisciplineId) return;
    const room = roomId(activeDisciplineId, currentPage.id);
    const socket = getSocket(currentUser);
    socket.emit("join:room", room);

    socket.on("takeoff:add", (item: TakeoffItem) => {
      setTakeoffItems(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item]);
      refreshAllPageTotals(); refreshDisciplineTotals();
    });

    socket.on("takeoff:update", (updated: TakeoffItem) => {
      setTakeoffItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
      refreshAllPageTotals(); refreshDisciplineTotals();
    });

    socket.on("takeoff:delete", (itemId: string) => {
      setTakeoffItems(prev => prev.filter(i => i.id !== itemId));
      refreshAllPageTotals(); refreshDisciplineTotals();
    });

    socket.on("presence:update", (users: ActiveUser[]) => {
      setActiveUsers(users.filter(u => u.userId !== currentUser.id));
    });

    socket.on("shape:lock", ({ itemId, userId, name }: { itemId: string; userId: string; name: string }) => {
      setShapeLocks(prev => { const n = new Map(prev); n.set(itemId, { userId, name }); return n; });
    });

    socket.on("shape:unlock", (itemId: string) => {
      setShapeLocks(prev => { const n = new Map(prev); n.delete(itemId); return n; });
    });

    socket.on("shape:locks:init", (locks: { itemId: string; userId: string; name: string }[]) => {
      setShapeLocks(new Map(locks.map(l => [l.itemId, { userId: l.userId, name: l.name }])));
    });

    return () => {
      socket.emit("leave:room", room);
      socket.off("takeoff:add");
      socket.off("takeoff:update");
      socket.off("takeoff:delete");
      socket.off("presence:update");
      socket.off("shape:lock");
      socket.off("shape:unlock");
      socket.off("shape:locks:init");
      setActiveUsers([]);
      setShapeLocks(new Map());
    };
  }, [currentPage?.id, activeDisciplineId]); // eslint-disable-line

  // ─── PDF rendering ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    viewportReady.current = false;
    setPdfLoading(true);
    setPdfError("");
    setPdfImage(null);
    setPdfSnapPoints([]);

    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument(drawing.downloadUrl).promise;
        const page = await pdf.getPage(currentPage.pageNumber);
        const vp = page.getViewport({ scale: 2 });
        const offscreen = document.createElement("canvas");
        offscreen.width = vp.width;
        offscreen.height = vp.height;
        const ctx = offscreen.getContext("2d")!;
        await page.render({ canvasContext: ctx as any, viewport: vp } as any).promise;

        // Extract PDF vector geometry for OSNAP (PDF.js v5 format + CTM tracking for AutoCAD)
        try {
          const opList = await (page as any).getOperatorList();
          const OPS = (pdfjsLib as any).OPS;
          const raw: { point: Point; type: string }[] = [];

          // CTM stack — AutoCAD PDFs heavily use q/cm/Q to transform coordinate spaces
          type Mat = [number,number,number,number,number,number];
          const ID: Mat = [1,0,0,1,0,0];
          const stack: Mat[] = [];
          let ctm: Mat = [...ID] as Mat;
          const concat = (m: Mat): Mat => [
            ctm[0]*m[0]+ctm[2]*m[1], ctm[1]*m[0]+ctm[3]*m[1],
            ctm[0]*m[2]+ctm[2]*m[3], ctm[1]*m[2]+ctm[3]*m[3],
            ctm[0]*m[4]+ctm[2]*m[5]+ctm[4], ctm[1]*m[4]+ctm[3]*m[5]+ctm[5],
          ];
          const cvt = (px: number, py: number): Point => {
            const x = ctm[0]*px + ctm[2]*py + ctm[4];
            const y = ctm[1]*px + ctm[3]*py + ctm[5];
            const [vx, vy] = (vp as any).convertToViewportPoint(x, y);
            return { x: vx, y: vy };
          };
          const mid = (a: Point, b: Point) =>
            raw.push({ point: { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }, type:"midpoint" });

          let cur: Point = {x:0,y:0}, ps: Point = {x:0,y:0};

          // PDF.js v5: constructPath args[0] is a flat interleaved array:
          // [opcode, ...coords, opcode, ...coords, ...]
          // where 0=moveTo(2), 1=lineTo(2), 2=curveTo(6), 3=closePath(0)
          const parseConstructPath = (data: ArrayLike<number>) => {
            let i = 0;
            while (i < data.length) {
              const op = data[i++];
              if (op === 0) {                          // moveTo
                cur = cvt(data[i], data[i+1]); ps = cur;
                raw.push({ point: cur, type:"endpoint" }); i += 2;
              } else if (op === 1) {                   // lineTo
                const nxt = cvt(data[i], data[i+1]);
                raw.push({ point: nxt, type:"endpoint" }); mid(cur, nxt); cur = nxt; i += 2;
              } else if (op === 2) {                   // curveTo — skip control pts, take endpoint
                const nxt = cvt(data[i+4], data[i+5]);
                raw.push({ point: nxt, type:"endpoint" }); cur = nxt; i += 6;
              } else if (op === 3) {                   // closePath
                mid(cur, ps); cur = ps;
              }
              // unknown opcode — skip (don't break, next entry may be valid)
            }
          };

          // OPS.constructPath removed from PDF.js v5 public API — use 91 (confirmed stable)
          const constructPathFn: number = OPS.constructPath ?? 91;

          for (let i = 0; i < opList.fnArray.length; i++) {
            const fn  = opList.fnArray[i];
            const a   = opList.argsArray[i];

            if      (fn === OPS.save)      { stack.push([...ctm] as Mat); }
            else if (fn === OPS.restore)   { ctm = stack.pop() ?? [...ID] as Mat; }
            else if (fn === OPS.transform) { ctm = concat(a as Mat); }
            else if (fn === constructPathFn) {
              // PDF.js v5 structure: a = [metadata, [Float32Array(flat_data)], bbox]
              // The flat interleaved [opcode,x,y,opcode,x,y,...] is at a[1][0]
              const flatData = (a[1] as any)?.[0] ?? (a[0] as any)?.[0];
              if (flatData != null) {
                parseConstructPath(flatData);
              }
            }
            else if (fn === OPS.moveTo)  { cur = cvt(a[0],a[1]); ps = cur; raw.push({point:cur, type:"endpoint"}); }
            else if (fn === OPS.lineTo)  { const n=cvt(a[0],a[1]); raw.push({point:n,type:"endpoint"}); mid(cur,n); cur=n; }
            else if (fn === OPS.curveTo) { const n=cvt(a[4],a[5]); raw.push({point:n,type:"endpoint"}); cur=n; }
            else if (fn === OPS.rectangle) {
              const [rx,ry,rw,rh]=a;
              [cvt(rx,ry),cvt(rx+rw,ry),cvt(rx+rw,ry+rh),cvt(rx,ry+rh)].forEach(p=>raw.push({point:p,type:"endpoint"}));
              raw.push({point:cvt(rx+rw/2,ry+rh/2),type:"center"});
            }
          }

          // Deduplicate within 2px, discard points outside PDF bounds, cap at 12000
          // Pass 1: basic bounds + proximity dedup (3px)
          const out: { point: Point; type: string }[] = [];
          for (const c of raw) {
            if (out.length >= 15000) break;
            const {x,y} = c.point;
            if (x < -20 || y < -20 || x > vp.width+20 || y > vp.height+20) continue;
            if (!out.some(d => Math.abs(d.point.x-x)<3 && Math.abs(d.point.y-y)<3)) out.push(c);
          }

          // Pass 2: density filter — solid fills (columns, walls) generate many points
          // in a small area. For cells with >5 points, keep only the 4 extreme corners.
          const CELL = 25; // canvas pixels per grid cell
          const MAX_CELL = 5;
          const grid = new Map<string, typeof out>();
          for (const c of out) {
            const key = `${Math.floor(c.point.x/CELL)},${Math.floor(c.point.y/CELL)}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key)!.push(c);
          }
          const final: typeof out = [];
          Array.from(grid.values()).forEach(pts => {
            if (pts.length <= MAX_CELL) {
              final.push(...pts);
            } else {
              // Dense cell (solid fill interior) — keep only the 4 extremes
              let mnX=pts[0], mxX=pts[0], mnY=pts[0], mxY=pts[0];
              for (const p of pts) {
                if (p.point.x < mnX.point.x) mnX = p;
                if (p.point.x > mxX.point.x) mxX = p;
                if (p.point.y < mnY.point.y) mnY = p;
                if (p.point.y > mxY.point.y) mxY = p;
              }
              [mnX, mxX, mnY, mxY].forEach((p, i, arr) => {
                if (arr.indexOf(p) === i) final.push(p); // deduplicate
              });
            }
          });

          if (!cancelled) setPdfSnapPoints(final);
        } catch { /* Scanned PDF — no vector data, snap to user shapes only */ }

        if (cancelled) return;
        const img = new window.Image();
        img.src = offscreen.toDataURL("image/jpeg", 0.95);
        img.onload = () => {
          if (cancelled) return;
          setPdfDims({ width: vp.width, height: vp.height });
          setPdfImage(img);
          setPdfLoading(false);
          viewportReady.current = false;
          const saved = (currentPage.canvasJson as { viewport?: { x: number; y: number; scale: number } } | null)?.viewport;
          if (saved) {
            setStagePos({ x: saved.x, y: saved.y });
            setScale(saved.scale);
          } else {
            fitToStage(vp.width, vp.height);
          }
          requestAnimationFrame(() => { viewportReady.current = true; });
        };
      } catch {
        if (!cancelled) { setPdfError("Failed to render PDF page."); setPdfLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [drawing.downloadUrl, currentPage?.pageNumber]); // eslint-disable-line

  // ─── Annotation helpers ───────────────────────────────────────────────────
  function commitAnnotations(next: Annotation[]) {
    annotationsRef.current = next;
    setAnnotations(next);
    setSelectedAnnotationIds(new Set());
    // Push to history
    const h = annotationHistoryRef.current.slice(0, annotationHistoryIdxRef.current + 1);
    h.push(next);
    if (h.length > 20) h.shift();
    annotationHistoryRef.current = h;
    annotationHistoryIdxRef.current = h.length - 1;
    // Debounced save
    if (annSaveTimer.current) clearTimeout(annSaveTimer.current);
    annSaveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ annotationsJson: { annotations: next } }),
        });
      } catch { /* silent — will retry on next annotation change */ }
    }, DEBOUNCE_MS);
  }

  function undoAnnotation() {
    if (annotationHistoryIdxRef.current <= 0) return;
    annotationHistoryIdxRef.current--;
    const prev = annotationHistoryRef.current[annotationHistoryIdxRef.current];
    setAnnotations(prev);
    if (annSaveTimer.current) clearTimeout(annSaveTimer.current);
    annSaveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ annotationsJson: { annotations: prev } }),
        });
      } catch { /* silent */ }
    }, DEBOUNCE_MS);
  }

  function saveTextAnnotation() {
    if (!textInput) return;
    const val = textInput.value.trim();
    if (val) {
      commitAnnotations([...annotations, {
        id: `a${++annotationCountRef.current}`, type: "text",
        x: textInput.imgX, y: textInput.imgY, text: val,
        color: markupColor, fontSize: 14,
      }]);
    }
    setTextInput(null);
  }

  function fitToStage(imgW: number, imgH: number) {
    const sw = stageSize.width - 32;
    const sh = stageSize.height - 32;
    const fitScale = Math.min(sw / imgW, sh / imgH, 1);
    setScale(fitScale);
    setStagePos({ x: (stageSize.width - imgW * fitScale) / 2, y: (stageSize.height - imgH * fitScale) / 2 });
  }

  // ─── Wheel zoom ───────────────────────────────────────────────────────
  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage()!;
    const pointer = stage.getPointerPosition()!;
    const delta = e.evt.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale * delta, 0.05), 8);
    const mousePos = { x: (pointer.x - stagePos.x) / scale, y: (pointer.y - stagePos.y) / scale };
    setStagePos({ x: pointer.x - mousePos.x * newScale, y: pointer.y - mousePos.y * newScale });
    setScale(newScale);
  }

  // ─── Viewport save ───────────────────────────────────────────────────
  useEffect(() => {
    if (!viewportReady.current || !currentPage) return;
    scheduleSave(currentPage.id, { viewport: { x: stagePos.x, y: stagePos.y, scale } });
  }, [stagePos.x, stagePos.y, scale]); // eslint-disable-line

  const scheduleSave = useCallback((pageId: string, data: Record<string, unknown>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${projectId}/drawings/${drawing.id}/pages/${pageId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canvasJson: data }),
        });
      } catch { /* silent — will retry on next viewport change */ }
    }, DEBOUNCE_MS);
  }, [projectId, drawing.id]);

  // ─── Coord helpers ────────────────────────────────────────────────────
  function stageToImage(sx: number, sy: number): Point {
    return { x: (sx - stagePos.x) / scale, y: (sy - stagePos.y) / scale };
  }

  // ─── Snap helper: find nearest endpoint among all takeoff items ───────
  type SnapType = "endpoint" | "midpoint" | "center";
  type SnapCandidate = { point: Point; type: SnapType };

  function buildSnapCandidates(): SnapCandidate[] {
    const candidates: SnapCandidate[] = [];

    for (const item of takeoffItemsRef.current) {
      const pts = item.toolData.points;
      if (!pts?.length) continue;
      const shape = item.shapeType;
      const tool = item.toolType;

      if (shape === "CIRCLE" && pts.length >= 2) {
        // Circle: center + 4 cardinal points
        const cx = pts[0].x, cy = pts[0].y;
        const r = Math.sqrt((pts[1].x - cx) ** 2 + (pts[1].y - cy) ** 2);
        candidates.push({ point: { x: cx, y: cy }, type: "center" });
        candidates.push({ point: { x: cx + r, y: cy }, type: "endpoint" });
        candidates.push({ point: { x: cx - r, y: cy }, type: "endpoint" });
        candidates.push({ point: { x: cx, y: cy + r }, type: "endpoint" });
        candidates.push({ point: { x: cx, y: cy - r }, type: "endpoint" });
      } else if (shape === "RECTANGLE" && pts.length >= 2) {
        // Rectangle: 4 corners + 4 edge midpoints + center
        const x1 = pts[0].x, y1 = pts[0].y, x2 = pts[1].x, y2 = pts[1].y;
        const corners = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
        corners.forEach(p => candidates.push({ point: p, type: "endpoint" }));
        candidates.push({ point: { x: (x1 + x2) / 2, y: y1 }, type: "midpoint" });
        candidates.push({ point: { x: (x1 + x2) / 2, y: y2 }, type: "midpoint" });
        candidates.push({ point: { x: x1, y: (y1 + y2) / 2 }, type: "midpoint" });
        candidates.push({ point: { x: x2, y: (y1 + y2) / 2 }, type: "midpoint" });
        candidates.push({ point: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, type: "center" });
      } else if (tool === "COUNT" && pts.length === 1) {
        candidates.push({ point: pts[0], type: "endpoint" });
      } else {
        // Polyline / arc / linear: endpoints + midpoints of each segment
        pts.forEach(p => candidates.push({ point: p, type: "endpoint" }));
        for (let i = 0; i < pts.length - 1; i++) {
          candidates.push({
            point: { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 },
            type: "midpoint",
          });
        }
      }
    }

    // In-progress polyline points also act as snap targets
    for (const pt of linearPointsRef.current) {
      candidates.push({ point: pt, type: "endpoint" });
    }

    // PDF vector geometry snap points (walls, lines, corners from the drawing itself)
    for (const c of pdfSnapPoints) {
      candidates.push(c as SnapCandidate);
    }

    return candidates;
  }

  function findSnapCandidate(imgPos: Point): SnapCandidate | null {
    const threshold = SNAP_RADIUS / scale;
    const candidates = buildSnapCandidates();
    let best: SnapCandidate | null = null;
    let bestDist = threshold;
    for (const c of candidates) {
      const d = Math.sqrt((c.point.x - imgPos.x) ** 2 + (c.point.y - imgPos.y) ** 2);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  function findSnap(imgPos: Point): Point | null {
    return findSnapCandidate(imgPos)?.point ?? null;
  }

  // ─── Undo/Redo ────────────────────────────────────────────────────────
  function setLinearPts(pts: Point[]) {
    linearPointsRef.current = pts;
    setLinearPoints(pts);
  }

  function setArcPts(pts: Point[]) {
    arcPointsRef.current = pts;
    setArcPoints(pts);
  }

  function resetDrawingState() {
    setLinearPts([]);
    setArcPts([]);
    setAreaRect(null);
    areaDragStart.current = null;
    circleCenterRef.current = null;
    setCirclePreview(null);
    setMousePos(null);
  }

  function pushHistory(items: TakeoffItem[]) {
    const newHistory = historyRef.current.slice(0, historyIdxRef.current + 1);
    newHistory.push(items);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    historyRef.current = newHistory;
    historyIdxRef.current = newHistory.length - 1;
    setTakeoffItems(items);
  }

  async function undo() {
    if (historyIdxRef.current <= 0) return;
    const cur = historyRef.current[historyIdxRef.current];
    const prev = historyRef.current[historyIdxRef.current - 1];
    // Items added in this step → delete from server so they don't reappear on refresh
    const toDelete = cur.filter(c => !prev.some(p => p.id === c.id));
    if (toDelete.length > 0 && currentPage) {
      await Promise.all(toDelete.map(item =>
        fetch(`/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/takeoff-items/${item.id}`, { method: "DELETE" }).catch(() => {})
      ));
    }
    historyIdxRef.current--;
    setTakeoffItems(historyRef.current[historyIdxRef.current]);
    if (toDelete.length > 0) { refreshAllPageTotals(); refreshDisciplineTotals(); }
  }

  function redo() {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    setTakeoffItems(historyRef.current[historyIdxRef.current]);
  }

  // ─── Save takeoff item to server ──────────────────────────────────────
  async function saveItem(toolType: string, shapeType: string, points: Point[]): Promise<boolean> {
    const group = takeoffGroups.find((g) => g.id === selectedGroupId);
    if (!group) { toast.warning("No takeoff layer selected. Select a layer in the Takeoff panel first."); return false; }
    if (group.isLocked) { toast.warning(`Layer "${group.name}" is locked. Unlock it first to draw shapes.`); return false; }
    const label = `${group.name} #${(takeoffItems.filter((i) => i.groupId === group.id).length) + 1}`;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/takeoff-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: group.id,
            label,
            toolType,
            shapeType,
            toolData: { points },
            multiplier: 1,
          }),
        }
      );
      if (res.ok) {
        const created = await res.json();
        pushHistory([...takeoffItems, created]);
        refreshAllPageTotals(); refreshDisciplineTotals();
        // Broadcast to other users on same tab + page
        if (currentPage && activeDisciplineId) {
          getSocket().emit("takeoff:add", { roomId: roomId(activeDisciplineId, currentPage.id), item: created });
        }
        return true;
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error?.message ?? "Failed to save measurement.");
        return false;
      }
    } catch {
      toast.error("Network error — could not save measurement.");
      return false;
    }
  }

  async function deleteMultiple(ids: string[]) {
    // Use refs so this works even when called from a stale keyboard-handler closure
    const items = takeoffItemsRef.current;
    const groups = takeoffGroupsRef.current;
    const deletable = ids.filter(id => {
      const item = items.find(i => i.id === id);
      const grp = item?.groupId ? groups.find(g => g.id === item.groupId) : undefined;
      return item && !item.isLocked && !grp?.isLocked;
    });
    if (!deletable.length) return;
    await Promise.all(
      deletable.map(id =>
        fetch(`/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/takeoff-items/${id}`, { method: "DELETE" })
      )
    );
    const deleted = new Set(deletable);
    pushHistory(items.filter(i => !deleted.has(i.id)));
    refreshAllPageTotals(); refreshDisciplineTotals();
    if (currentPage && activeDisciplineId) {
      deletable.forEach(id => getSocket().emit("takeoff:delete", { roomId: roomId(activeDisciplineId, currentPage.id), itemId: id }));
    }
  }

  async function saveNodeEdit(item: TakeoffItem, pts: Point[]) {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/takeoff-items/${item.id}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toolData: { points: pts }, version: item.version }) }
      );
      if (res.ok) {
        const updated = await res.json();
        pushHistory(takeoffItems.map(i => i.id === item.id ? { ...i, ...updated } : i));
        refreshAllPageTotals(); refreshDisciplineTotals();
        if (currentPage && activeDisciplineId) {
          getSocket(currentUser).emit("takeoff:update", { roomId: roomId(activeDisciplineId, currentPage.id), item: updated });
        }
      } else if (res.status === 409) {
        // Another user saved a newer version — reload the page's items so we're back in sync
        refreshItems();
        toast.info("Someone else just edited this shape — it has been refreshed.");
      }
    } catch {
    } finally {
      setNodeEditState(null);
    }
  }

  async function deleteItem(itemId: string) {
    const item = takeoffItems.find((i) => i.id === itemId);
    if (!item || item.isLocked) return;
    const res = await fetch(
      `/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/takeoff-items/${itemId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d?.error?.message ?? "Failed to delete takeoff item.");
      return;
    }
    pushHistory(takeoffItems.filter((i) => i.id !== itemId));
    refreshAllPageTotals(); refreshDisciplineTotals();
    // Broadcast deletion to other users on same tab + page
    if (currentPage && activeDisciplineId) {
      getSocket().emit("takeoff:delete", { roomId: roomId(activeDisciplineId, currentPage.id), itemId });
    }
  }

  // ─── Explode polyline into individual segments ────────────────────────
  async function explodePolyline(item: TakeoffItem) {
    const pts = item.toolData.points;
    if (pts.length < 3) return;
    const grp = takeoffGroupsRef.current.find(g => g.id === item.groupId);
    if (!grp || grp.type === "AREA" || grp.type === "VOLUME") return;

    const segCount = pts.length - 1;
    const explodeOk = await new Promise<boolean>(res => {
      toast(`Explode into ${segCount} segments?`, {
        description: "Each segment will be a separate takeoff line. You can then delete unwanted segments.",
        action: { label: "Explode", onClick: () => res(true) },
        cancel: { label: "Cancel", onClick: () => res(false) },
        duration: 10000,
      });
    });
    if (!explodeOk) return;

    // Create one takeoff item per segment
    const created: TakeoffItem[] = [];
    for (let i = 0; i < segCount; i++) {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/takeoff-items`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              groupId: item.groupId,
              label: `${grp.name} #seg${i + 1}`,
              toolType: item.toolType,
              shapeType: "POLYLINE",
              toolData: { points: [pts[i], pts[i + 1]] },
              multiplier: (item as any).multiplier ?? grp.multiplier ?? 1,
            }),
          }
        );
        if (res.ok) {
          const newItem = await res.json();
          created.push(newItem);
          if (currentPage && activeDisciplineId) {
            getSocket().emit("takeoff:add", { roomId: roomId(activeDisciplineId, currentPage.id), item: newItem });
          }
        }
      } catch { /* continue with remaining segments */ }
    }

    // Delete the original polyline
    await fetch(
      `/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/takeoff-items/${item.id}`,
      { method: "DELETE" }
    );
    if (currentPage && activeDisciplineId) {
      getSocket().emit("takeoff:delete", { roomId: roomId(activeDisciplineId, currentPage.id), itemId: item.id });
    }

    // Update local state
    const remaining = takeoffItemsRef.current.filter(i => i.id !== item.id);
    pushHistory([...remaining, ...created]);
    refreshAllPageTotals(); refreshDisciplineTotals();
    setSelectedItemIds(new Set());
  }

  // ─── Mouse handlers ───────────────────────────────────────────────────

  function getPosFromEvent(e: Konva.KonvaEventObject<MouseEvent>): { imgPos: Point; snapped: Point } | null {
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return null;
    const imgPos = stageToImage(pos.x, pos.y);
    return { imgPos, snapped: findSnap(imgPos) ?? imgPos };
  }

  function withinPdf(p: Point): boolean {
    return p.x >= 0 && p.x <= pdfDims.width && p.y >= 0 && p.y <= pdfDims.height;
  }

  // Snap cursor to nearest 45° increment from anchor (for Shift-constrained lines)
  function angleSnap(anchor: Point, cursor: Point): Point {
    const dx = cursor.x - anchor.x;
    const dy = cursor.y - anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return cursor;
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return { x: anchor.x + dist * Math.cos(snapped), y: anchor.y + dist * Math.sin(snapped) };
  }

  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    // Right or middle button → manual pan in ALL modes (even mid-polygon)
    if (e.evt.button === 1 || e.evt.button === 2) {
      e.evt.preventDefault();
      isPanningRef.current = true;
      panStartClientRef.current = { x: e.evt.clientX, y: e.evt.clientY };
      panStartStagePosRef.current = { ...stagePos };
      return;
    }

    const r = getPosFromEvent(e);
    if (!r) return;
    const { imgPos, snapped } = r;

    if (mode === "calibrate" && calibPanelMode === "manual" && calibStep === "draw") {
      if (!calibAnchor.current) {
        // First click — set anchor, begin preview
        calibAnchor.current = snapped;
        setCalibLine({ x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y });
      } else {
        // Second click — finalise line
        const end = isShiftHeld.current ? angleSnap(calibAnchor.current, snapped) : snapped;
        const dx = end.x - calibAnchor.current.x;
        const dy = end.y - calibAnchor.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          setCalibLine({ x1: calibAnchor.current.x, y1: calibAnchor.current.y, x2: end.x, y2: end.y });
          setCalibStep("input");
        }
      }
      return;
    }

    if (mode === "zone") {
      zoneDragStart.current = imgPos;
      setZoneRect({ x: imgPos.x, y: imgPos.y, width: 0, height: 0 });
      return;
    }

    // Rectangle: start drag
    if (mode === "rectangle" && selectedGroupId) {
      if (!withinPdf(imgPos)) return;
      const grp = takeoffGroups.find(g => g.id === selectedGroupId);
      if (grp?.isLocked) return;
      areaDragStart.current = imgPos;
      setAreaRect({ x: imgPos.x, y: imgPos.y, width: 0, height: 0 });
      return;
    }

    // Circle: record center on mousedown, radius defined by drag
    if (mode === "circle" && selectedGroupId) {
      if (!withinPdf(imgPos)) return;
      const grp = takeoffGroups.find(g => g.id === selectedGroupId);
      if (grp?.isLocked) return;
      circleCenterRef.current = imgPos;
      setCirclePreview({ cx: imgPos.x, cy: imgPos.y, r: 0 });
      return;
    }

    if (mode === "pen") {
      isPenDrawingRef.current = true;
      penDraftRef.current = [imgPos.x, imgPos.y];
      setPenDraft([imgPos.x, imgPos.y]);
      return;
    }

    if (mode === "highlight") {
      highlightStartRef.current = imgPos;
      setHighlightDraft({ x: imgPos.x, y: imgPos.y, width: 0, height: 0 });
      return;
    }

    if (mode === "xline") {
      xlineStartRef.current = imgPos;
    }
    if (mode === "arrow") {
      arrowStartRef.current = imgPos;
      setArrowDraft({ x1: imgPos.x, y1: imgPos.y, x2: imgPos.x, y2: imgPos.y });
      return;
    }

    if (mode === "count" && selectedGroupId) {
      if (!withinPdf(snapped)) return;
      const grp = takeoffGroups.find(g => g.id === selectedGroupId);
      if (grp?.isLocked) return;
      // Prevent stacking: skip if another COUNT item in the same group is within 8px
      const tooClose = takeoffItems.some(i =>
        i.groupId === selectedGroupId &&
        i.toolData?.points?.length === 1 &&
        Math.hypot(
          (i.toolData.points[0].x ?? 0) - snapped.x,
          (i.toolData.points[0].y ?? 0) - snapped.y
        ) < 8
      );
      if (tooClose) return;
      saveItem("COUNT", "CIRCLE", [snapped]);
      return;
    }

    if (mode === "select" && (e.target === e.target.getStage() || e.target.className === "Image")) {
      if (isShiftHeld.current) {
        // Start rubber-band to add to selection
        rubberBandStart.current = imgPos;
        isRubberBandingRef.current = true;
        setRubberBand({ x: imgPos.x, y: imgPos.y, width: 0, height: 0 });
      } else {
        setSelectedItemIds(new Set());
        setSelectedMeasurementIds(new Set());
        // Left-click drag on empty space → pan (replacing Konva draggable)
        isPanningRef.current = true;
        panStartClientRef.current = { x: e.evt.clientX, y: e.evt.clientY };
        panStartStagePosRef.current = { ...stagePos };
      }
    }
  }

  // onClick — polyline: single click adds point, double-click finishes; arc: 3 clicks; measure: 2 clicks
  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    // Only left-click should trigger drawing or selection actions
    if (e.evt.button !== 0) return;

    if (mode === "markup-text") {
      const pos = e.target.getStage()?.getPointerPosition();
      if (!pos) return;
      const imgPos = stageToImage(pos.x, pos.y);
      setTextInput({ imgX: imgPos.x, imgY: imgPos.y, value: "" });
      return;
    }

    if (mode === "measure") {
      const pos = e.target.getStage()?.getPointerPosition();
      if (!pos) return;
      const imgPos = stageToImage(pos.x, pos.y);
      const pt = findSnap(imgPos) ?? imgPos;
      if (!measureAnchor) {
        setMeasureAnchor(pt);
      } else {
        // Apply Shift angle-snap on the final click too
        const endPt = isShiftHeld.current ? angleSnap(measureAnchor, pt) : pt;
        setMeasurements(prev => [...prev, { id: `m${++measureCountRef.current}`, start: measureAnchor, end: endPt }]);
        setMeasureAnchor(null); // ready for the next ruler immediately
      }
      return;
    }

    if (mode !== "polyline" && mode !== "arc") return;
    if (!selectedGroupId) return;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const imgPos = stageToImage(pos.x, pos.y);
    const snapped = findSnap(imgPos) ?? imgPos;
    if (!withinPdf(snapped)) return; // ignore clicks outside the drawing
    const group = takeoffGroups.find(g => g.id === selectedGroupId);
    if (group?.isLocked) return; // locked layer — no new shapes allowed

    if (mode === "polyline") {
      const now = Date.now();
      const isDouble = now - lastClickTime.current < 350;
      lastClickTime.current = now;

      if (isDouble) {
        const pts = [...linearPointsRef.current];
        if (pts.length >= 2) {
          const volumeMethod = (group?.additionalParams as any)?.volumeMethod ?? "area_x_h";
          const isClosed = group?.type === "AREA" || (group?.type === "VOLUME" && volumeMethod !== "lbh");
          saveItem(group?.type ?? "LINEAR", isClosed ? "POLYGON" : "POLYLINE", pts).then(ok => {
            if (ok) { linearPointsRef.current = []; setLinearPoints([]); setMousePos(null); }
          });
        }
        return;
      }

      // Angle-snap the new point if Shift held and there's a previous anchor
      let pt = snapped;
      if (isShiftHeld.current && linearPointsRef.current.length > 0) {
        pt = angleSnap(linearPointsRef.current[linearPointsRef.current.length - 1], snapped);
      }

      const newPts = [...linearPointsRef.current, pt];
      linearPointsRef.current = newPts;
      setLinearPoints(newPts);
      return;
    }

    if (mode === "arc") {
      const newPts = [...arcPointsRef.current, snapped];
      if (newPts.length < 3) {
        setArcPts(newPts);
      } else {
        // 3rd click — save arc
        saveItem(group?.type ?? "LINEAR", "ARC", newPts).then(ok => {
          if (ok) { setArcPts([]); setMousePos(null); }
        });
      }
    }
  }

  async function finishPolyline() {
    const pts = linearPointsRef.current;
    const group = takeoffGroups.find(g => g.id === selectedGroupId);
    if (selectedGroupId && pts.length >= 2) {
      const volumeMethod = (group?.additionalParams as any)?.volumeMethod ?? "area_x_h";
      const isClosed = group?.type === "AREA" || (group?.type === "VOLUME" && volumeMethod !== "lbh");
      const ok = await saveItem(group?.type ?? "LINEAR", isClosed ? "POLYGON" : "POLYLINE", [...pts]);
      if (ok) {
        linearPointsRef.current = [];
        setLinearPoints([]);
        setMousePos(null);
      }
    }
  }

  function handleStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    // Manual pan in progress — move stage directly for zero-lag panning
    if (isPanningRef.current && panStartClientRef.current) {
      const dx = e.evt.clientX - panStartClientRef.current.x;
      const dy = e.evt.clientY - panStartClientRef.current.y;
      const newX = panStartStagePosRef.current.x + dx;
      const newY = panStartStagePosRef.current.y + dy;
      const stage = e.target.getStage();
      if (stage) { stage.x(newX); stage.y(newY); }
      setStagePos({ x: newX, y: newY });
      return;
    }

    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const imgPos = stageToImage(pos.x, pos.y);
    const candidate = findSnapCandidate(imgPos);
    const snapped = candidate?.point ?? null;
    let livePos = snapped ?? imgPos;

    // Shift held in polyline mode → constrain to nearest 45° from the last placed point
    if (mode === "polyline" && isShiftHeld.current && linearPointsRef.current.length > 0) {
      const anchor = linearPointsRef.current[linearPointsRef.current.length - 1];
      livePos = angleSnap(anchor, livePos);
    }

    // Shift held in measure mode → constrain to nearest 45° from the placed anchor
    if (mode === "measure" && isShiftHeld.current && measureAnchor) {
      livePos = angleSnap(measureAnchor, livePos);
    }

    setMousePos(livePos);
    const showSnap = !isShiftHeld.current || mode !== "polyline";
    setSnapPoint(showSnap ? snapped : null);
    setSnapCandidate(showSnap && candidate ? candidate : null);


    if (mode === "calibrate" && calibPanelMode === "manual" && calibStep === "draw" && calibAnchor.current) {
      const end = isShiftHeld.current ? angleSnap(calibAnchor.current, imgPos) : imgPos;
      setCalibLine({ x1: calibAnchor.current.x, y1: calibAnchor.current.y, x2: end.x, y2: end.y });
    }

    if (mode === "zone" && zoneDragStart.current) {
      const x = Math.min(zoneDragStart.current.x, imgPos.x);
      const y = Math.min(zoneDragStart.current.y, imgPos.y);
      setZoneRect({ x, y, width: Math.abs(imgPos.x - zoneDragStart.current.x), height: Math.abs(imgPos.y - zoneDragStart.current.y) });
    }

    if (mode === "pen" && isPenDrawingRef.current) {
      if (isShiftHeld.current && penDraftRef.current.length >= 2) {
        // Shift held: show a straight angle-snapped line from start to cursor (don't push more points)
        const start = { x: penDraftRef.current[0], y: penDraftRef.current[1] };
        const snappedEnd = angleSnap(start, imgPos);
        setPenDraft([start.x, start.y, snappedEnd.x, snappedEnd.y]);
      } else {
        penDraftRef.current.push(imgPos.x, imgPos.y);
        setPenDraft([...penDraftRef.current]);
      }
    }

    if (mode === "highlight" && highlightStartRef.current) {
      const s = highlightStartRef.current;
      let w = Math.abs(imgPos.x - s.x), h = Math.abs(imgPos.y - s.y);
      // Shift held: constrain to square
      if (isShiftHeld.current) { const sq = Math.max(w, h); w = sq; h = sq; }
      setHighlightDraft({ x: Math.min(s.x, imgPos.x), y: Math.min(s.y, imgPos.y), width: w, height: h });
    }

    if (mode === "arrow" && arrowStartRef.current) {
      const end = isShiftHeld.current
        ? angleSnap(arrowStartRef.current, imgPos)
        : imgPos;
      setArrowDraft({ x1: arrowStartRef.current.x, y1: arrowStartRef.current.y, x2: end.x, y2: end.y });
    }
    if (mode === "xline" && xlineStartRef.current) {
      const end = isShiftHeld.current
        ? angleSnap(xlineStartRef.current, imgPos)
        : imgPos;
      setXlineDraft({ x1: xlineStartRef.current.x, y1: xlineStartRef.current.y, x2: end.x, y2: end.y });
    }

    if (mode === "rectangle" && areaDragStart.current) {
      const x = Math.min(areaDragStart.current.x, imgPos.x);
      const y = Math.min(areaDragStart.current.y, imgPos.y);
      setAreaRect({ x, y, width: Math.abs(imgPos.x - areaDragStart.current.x), height: Math.abs(imgPos.y - areaDragStart.current.y) });
    }

    if (mode === "circle" && circleCenterRef.current) {
      const dx = imgPos.x - circleCenterRef.current.x;
      const dy = imgPos.y - circleCenterRef.current.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      setCirclePreview({ cx: circleCenterRef.current.x, cy: circleCenterRef.current.y, r });
    }

    if (isRubberBandingRef.current && rubberBandStart.current) {
      const stage = e.target.getStage();
      if (stage) {
        stage.stopDrag();
        // Hard-reset stage position to prevent drift corrupting image coordinates
        stage.x(stagePos.x);
        stage.y(stagePos.y);
      }
      const x = Math.min(rubberBandStart.current.x, imgPos.x);
      const y = Math.min(rubberBandStart.current.y, imgPos.y);
      setRubberBand({ x, y, width: Math.abs(imgPos.x - rubberBandStart.current.x), height: Math.abs(imgPos.y - rubberBandStart.current.y) });
    }
  }

  function handleStageMouseUp(e: Konva.KonvaEventObject<MouseEvent>) {
    // End manual pan (right/middle or left in select mode)
    if (isPanningRef.current) {
      isPanningRef.current = false;
      panStartClientRef.current = null;
      return;
    }

    if (mode === "zone" && zoneDragStart.current) {
      if (zoneRect && zoneRect.width > 10 && zoneRect.height > 10) setShowZonePanel(true);
      else setZoneRect(null);
      zoneDragStart.current = null;
    }

    if (mode === "pen" && isPenDrawingRef.current) {
      isPenDrawingRef.current = false;
      // Shift held: commit the angle-snapped straight line shown in the draft display
      const pointsToCommit = (isShiftHeld.current && penDraft && penDraft.length === 4)
        ? penDraft
        : penDraftRef.current;
      if (pointsToCommit.length >= 4) {
        commitAnnotations([...annotationsRef.current, { id: `a${++annotationCountRef.current}`, type: "pen", points: [...pointsToCommit], color: markupColor, strokeWidth: markupStrokeWidth }]);
      }
      penDraftRef.current = [];
      setPenDraft(null);
    }

    if (mode === "highlight" && highlightStartRef.current) {
      highlightStartRef.current = null;
      if (highlightDraft && highlightDraft.width > 8 && highlightDraft.height > 8) {
        commitAnnotations([...annotationsRef.current, { id: `a${++annotationCountRef.current}`, type: "highlight", ...highlightDraft, color: markupColor }]);
      }
      setHighlightDraft(null);
    }

    if (mode === "arrow" && arrowStartRef.current && arrowDraft) {
      const dx = arrowDraft.x2 - arrowDraft.x1, dy = arrowDraft.y2 - arrowDraft.y1;
      if (Math.sqrt(dx * dx + dy * dy) > 10 / scale) {
        commitAnnotations([...annotationsRef.current, { id: `a${++annotationCountRef.current}`, type: "arrow", ...arrowDraft, color: markupColor, strokeWidth: markupStrokeWidth }]);
      }
      arrowStartRef.current = null;
      setArrowDraft(null);
    }
    if (mode === "xline" && xlineStartRef.current && xlineDraft) {
      const dx = xlineDraft.x2 - xlineDraft.x1, dy = xlineDraft.y2 - xlineDraft.y1;
      if (Math.sqrt(dx * dx + dy * dy) > 10 / scale) {
        commitAnnotations([...annotationsRef.current, { id: `a${++annotationCountRef.current}`, type: "xline", ...xlineDraft, color: markupColor, strokeWidth: markupStrokeWidth }]);
      }
      xlineStartRef.current = null;
      setXlineDraft(null);
    }

    if (mode === "rectangle" && areaDragStart.current) {
      if (areaRect && areaRect.width > 5 && areaRect.height > 5) {
        const { x, y, width, height } = areaRect;
        const group = takeoffGroups.find(g => g.id === selectedGroupId);
        saveItem(group?.type ?? "AREA", "RECTANGLE", [
          { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
        ]);
      }
      setAreaRect(null);
      areaDragStart.current = null;
    }

    if (isRubberBandingRef.current) {
      isRubberBandingRef.current = false;
      rubberBandStart.current = null;
      e.target.getStage()?.x(stagePos.x);
      e.target.getStage()?.y(stagePos.y);
      if (rubberBand && rubberBand.width > 4 && rubberBand.height > 4) {
        const { x, y, width, height } = rubberBand;
        const hit = visibleItems
          .filter(item => {
            const grp = item.groupId ? takeoffGroups.find(g => g.id === item.groupId) : undefined;
            if (item.isLocked || grp?.isLocked) return false;
            return item.toolData.points.some(p =>
              p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + height
            );
          })
          .map(item => item.id);
        if (hit.length) {
          setSelectedItemIds(prev => new Set([...Array.from(prev), ...hit]));
        }
      }
      setRubberBand(null);
      return;
    }

    if (mode === "circle" && selectedGroupId && circleCenterRef.current && mousePos) {
      const dx = mousePos.x - circleCenterRef.current.x;
      const dy = mousePos.y - circleCenterRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        const group = takeoffGroups.find(g => g.id === selectedGroupId);
        saveItem(group?.type ?? "LINEAR", "CIRCLE", [circleCenterRef.current, mousePos]);
      }
      circleCenterRef.current = null;
      setCirclePreview(null);
    }
  }

  // ─── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        resetDrawingState();
        nodeEditRef.current = null;
        setNodeEditState(null);
        isRubberBandingRef.current = false;
        rubberBandStart.current = null;
        setRubberBand(null);
        setMeasureAnchor(null);
        setSelectedMeasurementIds(new Set());
        measureNodeEditRef.current = null;
        isPenDrawingRef.current = false; penDraftRef.current = []; setPenDraft(null);
        arrowStartRef.current = null; setArrowDraft(null);
        xlineStartRef.current = null; setXlineDraft(null);
        highlightStartRef.current = null; setHighlightDraft(null);
        setTextInput(null);
        setSelectedAnnotationIds(new Set());
        setMeasureNodeEdit(null);
        if (mode !== "select") setMode("select");
        setSelectedItemIds(new Set());
      }
      if (e.key === "Enter") { e.preventDefault(); finishPolyline(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        if (mode === "select") {
          // Select all visible, unlocked takeoff items on this page
          const allIds = takeoffItemsRef.current
            .filter(i => {
              const grp = takeoffGroupsRef.current.find(g => g.id === i.groupId);
              return !i.isLocked && !grp?.isLocked && grp?.isVisible !== false;
            })
            .map(i => i.id);
          setSelectedItemIds(new Set(allIds));
          setSelectedAnnotationIds(new Set());
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (["pen","markup-text","highlight","arrow","xline"].includes(mode)) undoAnnotation();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedAnnotationIdsRef.current.size > 0) {
          const delIds = selectedAnnotationIdsRef.current;
          const next = annotationsRef.current.filter(a => !delIds.has(a.id));
          commitAnnotations(next);
          return;
        }
        if (selectedMeasurementIdsRef.current.size > 0) {
          const delIds = selectedMeasurementIdsRef.current;
          setMeasurements(prev => prev.filter(m => !delIds.has(m.id)));
          setSelectedMeasurementIds(new Set());
        } else if (mode === "polyline" && linearPointsRef.current.length > 0) {
          setLinearPts(linearPointsRef.current.slice(0, -1));
        } else if (mode === "arc" && arcPointsRef.current.length > 0) {
          setArcPts(arcPointsRef.current.slice(0, -1));
        } else if (mode === "select" && selectedItemIdsRef.current.size > 0) {
          const ids = Array.from(selectedItemIdsRef.current);
          const n = ids.length;
          const msg = n === 1 ? "Delete this shape?" : `Delete ${n} shapes?`;
          toast(msg, {
            action: { label: "Delete", onClick: () => { setSelectedItemIds(new Set()); void deleteMultiple(ids); } },
            cancel: { label: "Cancel", onClick: () => {} },
            duration: 5000,
          });
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mode, linearPoints]); // eslint-disable-line

  // ─── Scale save helpers ───────────────────────────────────────────────
  async function saveScale(pageScale: number, unit: string) {
    await fetch(`/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scale: pageScale, scaleUnit: unit }),
    });
    setPages((prev) => prev.map((p) => p.id === currentPage.id ? { ...p, scale: pageScale, scaleUnit: unit } : p));
    setMode("select");
    setCalibLine(null);
    setCalibStep("draw");
  }

  function handleCalibPanelModeChange(m: "common" | "manual") {
    setCalibPanelMode(m);
    setCalibLine(null);
    setCalibStep("draw");
    calibAnchor.current = null;
  }

  function handleApplyCommon(scaleVal: number, unit: "ft") { saveScale(scaleVal, unit); }
  function handleApplyManual(realFt: number) {
    if (!calibLine) return;
    const dx = calibLine.x2 - calibLine.x1;
    const dy = calibLine.y2 - calibLine.y1;
    const pxLen = Math.sqrt(dx * dx + dy * dy);
    saveScale(computeScale(pxLen, realFt), "ft");
  }

  // ─── Zone save ────────────────────────────────────────────────────────
  async function handleZoneSaved(zoneScale: number, unit: string, label: string) {
    if (!zoneRect) return;
    const res = await fetch(
      `/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/scale-zones`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...zoneRect, scale: zoneScale, scaleUnit: unit, label: label || undefined }),
      }
    );
    if (!res.ok) { const d = await res.json(); toast.error(d.error?.message ?? "Failed to save zone."); return; }
    const newZone = await res.json();
    setPages((prev) => prev.map((p) => p.id === currentPage.id ? { ...p, scaleZones: [...p.scaleZones, newZone] } : p));
    setZoneRect(null);
    setShowZonePanel(false);
    setMode("select");
  }

  async function handleZoneDeleted(zoneId: string) {
    await fetch(`/api/projects/${projectId}/drawings/${drawing.id}/pages/${currentPage.id}/scale-zones/${zoneId}`, { method: "DELETE" });
    setPages((prev) => prev.map((p) => p.id === currentPage.id ? { ...p, scaleZones: p.scaleZones.filter((z) => z.id !== zoneId) } : p));
  }

  // ─── Live quantity display (uses rawQuantity + current group params) ──
  // This means canvas labels update immediately when params change — no redraw needed.
  function liveQty(item: TakeoffItem, group: TakeoffGroup | undefined): { qty: number; unit: string } {
    if (!group) return { qty: item.quantity, unit: item.unit };
    const raw = item.rawQuantity;
    const mult = group.multiplier ?? 1;
    const ap = group.additionalParams as Record<string, unknown> | null;
    const su = currentPage.scaleUnit;

    switch (group.type) {
      case "COUNT":
        return { qty: raw * mult, unit: "each" };

      case "VERTICAL_WALL_AREA": {
        const wObj = ap?.wall as Record<string, unknown> | undefined;
        const wallH = wObj?.enabled ? (Number(wObj.heightFt ?? 0) + Number(wObj.heightIn ?? 0) / 12) : 0;
        if (!wallH) return { qty: raw * mult, unit: `${su} (set wall height)` };
        return { qty: raw * wallH * mult, unit: su === "ft" ? "sq ft" : "sq m" };
      }

      case "COUNT_BY_DISTANCE": {
        const spObj = ap?.spacing as Record<string, unknown> | undefined;
        const spacing = spObj ? (Number(spObj.ft ?? 0) + Number(spObj.in ?? 0) / 12) : 0;
        if (!spacing) return { qty: raw * mult, unit: `${su} (set spacing)` };
        return { qty: (Math.floor(raw / spacing) + 1) * mult, unit: "each" };
      }

      case "VOLUME": {
        const method = (ap?.volumeMethod as string) ?? "area_x_h";
        const hObj = ap?.height as Record<string, unknown> | undefined;
        const heightFt = hObj ? (Number(hObj.ft ?? 0) + Number(hObj.in ?? 0) / 12) : 0;
        if (method === "lbh") {
          const bObj = ap?.breadth as Record<string, unknown> | undefined;
          const breadthFt = bObj ? (Number(bObj.ft ?? 0) + Number(bObj.in ?? 0) / 12) : 0;
          if (!breadthFt || !heightFt) {
            const missing = !breadthFt && !heightFt ? "breadth+height" : !breadthFt ? "breadth" : "height";
            return { qty: raw * mult, unit: `${su} (set ${missing})` };
          }
          return { qty: raw * breadthFt * heightFt * mult, unit: su === "ft" ? "cu ft" : "cu m" };
        }
        if (!heightFt) return { qty: raw * mult, unit: (su === "ft" ? "sq ft" : "sq m") + " (set height)" };
        return { qty: raw * heightFt * mult, unit: su === "ft" ? "cu ft" : "cu m" };
      }

      default:
        return { qty: raw * mult, unit: item.unit };
    }
  }

  // ─── Cursor ───────────────────────────────────────────────────────────
  const cursor =
    mode === "pen" ? "crosshair" :
    mode === "markup-text" ? "text" :
    mode === "highlight" ? "crosshair" :
    mode === "arrow" ? "crosshair" :
    mode === "calibrate" ? "crosshair" :
    mode === "zone" ? "crosshair" :
    mode === "polyline" ? "crosshair" :
    mode === "rectangle" ? "crosshair" :
    mode === "circle" ? "crosshair" :
    mode === "arc" ? "crosshair" :
    mode === "count" ? "cell" :
    mode === "measure" ? "crosshair" :
    "grab";

  // ─── Viewport culling: scale zones ────────────────────────────────────
  if (!currentPage) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900 text-gray-600 text-sm">
        This drawing has no pages. Try re-uploading the file.
      </div>
    );
  }

  const visibleZones = currentPage.scaleZones.filter((z) => {
    const zx = z.x * scale + stagePos.x;
    const zy = z.y * scale + stagePos.y;
    const zw = z.width * scale;
    const zh = z.height * scale;
    return zx < stageSize.width && zy < stageSize.height && zx + zw > 0 && zy + zh > 0;
  });

  // ─── Visible takeoff items (active tab + isVisible) ──────────────────
  const visibleGroupIds = new Set(
    takeoffGroups
      .filter((g) => g.isVisible && g.disciplineId === activeDisciplineId)
      .map((g) => g.id)
  );
  const visibleItems = takeoffItems.filter((i) => i.groupId && visibleGroupIds.has(i.groupId));

  // ─── Client-side quantity preview ─────────────────────────────────────
  function previewLength(points: Point[]): string {
    if (points.length < 2) return "";
    const sr = effectiveScale(points, currentPage.scale, currentPage.scaleUnit, currentPage.scaleZones);
    if (!sr) return `${points.length - 1} seg`;
    let totalPx = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      totalPx += Math.sqrt(dx * dx + dy * dy);
    }
    const real = totalPx * sr.scale;
    return sr.scaleUnit === "ft" ? ftToFeetIn(real) : `${real.toFixed(2)} ${sr.scaleUnit}`;
  }

  function previewArea(rect: { x: number; y: number; width: number; height: number }): string {
    const center = [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }];
    const sr = effectiveScale(center, currentPage.scale, currentPage.scaleUnit, currentPage.scaleZones);
    if (!sr) return "";
    const area = rect.width * rect.height * sr.scale * sr.scale;
    const unit = sr.scaleUnit === "ft" ? "sq ft" : "sq m";
    return `${area.toFixed(2)} ${unit}`;
  }

  // ─── Compute group totals (volume-aware, filtered by method) ─────────
  const groupTotals: Record<string, { rawQty: number; unit: string }> = {};
  for (const item of takeoffItems) {
    if (!item.groupId) continue;
    const grp = takeoffGroups.find(g => g.id === item.groupId);
    if (!groupTotals[item.groupId]) groupTotals[item.groupId] = { rawQty: 0, unit: item.unit };
    if (grp?.type === "VOLUME") {
      const ap = grp.additionalParams as Record<string, unknown> | null;
      const method = (ap?.volumeMethod as string) ?? "area_x_h";
      // lbh method uses polyline (length-based); area_x_h uses rectangle/polygon (area-based)
      const isLengthShape = item.shapeType === "POLYLINE" || item.shapeType === "ARC" || item.shapeType === null;
      const isAreaShape = item.shapeType === "RECTANGLE" || item.shapeType === "CIRCLE" || item.shapeType === "POLYGON";
      if ((method === "lbh" && isLengthShape) || (method !== "lbh" && isAreaShape)) {
        groupTotals[item.groupId].rawQty += item.rawQuantity;
      }
    } else {
      groupTotals[item.groupId].rawQty += item.rawQuantity;
    }
  }

  const liveItemCounts: Record<string, number> = {};
  for (const item of takeoffItems) {
    if (item.groupId) liveItemCounts[item.groupId] = (liveItemCounts[item.groupId] ?? 0) + 1;
  }

  // ─── Render ───────────────────────────────────────────────────────────
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div className={`flex h-full overflow-hidden${isResizingSidebar ? " select-none cursor-col-resize" : ""}`}>
      {/* ── Left sidebar ── */}
      {/* On mobile: overlay (absolute) so it doesn't squeeze the canvas */}
      <aside
        className={`bg-gray-800 border-r border-gray-700 flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200 ${
          isMobile
            ? `absolute left-0 top-0 bottom-0 z-40 ${sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`
            : sidebarOpen ? "relative" : "w-0"
        }`}
        style={
          isMobile
            ? { width: Math.min(sidebarWidth, 320) }
            : sidebarOpen
            ? ({ width: sidebarWidth, "--sidebar-w": `${sidebarWidth}px` } as React.CSSProperties)
            : { width: 0 }
        }
      >
        {/* ── Resize handle (desktop only) ── */}
        {!isMobile && sidebarOpen && (
          <div
            onMouseDown={handleSidebarResizeStart}
            className="absolute right-0 top-0 bottom-0 w-1 z-50 cursor-col-resize group flex items-center justify-center"
            title="Drag to resize"
          >
            <div className="w-0.5 h-10 rounded-full bg-gray-600 group-hover:bg-blue-400 group-hover:h-16 transition-all duration-150" />
          </div>
        )}
        {/* Sidebar header */}
        <div className="flex items-center border-b border-gray-700 text-xs font-medium flex-shrink-0">
          <div className="flex-1 py-2 text-center text-white font-semibold text-xs bg-gray-700">Takeoff</div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="px-2 py-2 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 transition"
            title="Collapse sidebar"
            aria-label="Collapse takeoff panel"
          >✕</button>
        </div>

        <TakeoffPanel
            projectId={projectId}
            initialGroups={initialGroups}
            allDrawings={allDrawings}
            disciplines={disciplines}
            selectedGroupId={selectedGroupId}
            activeDisciplineId={activeDisciplineId}
            onSelectGroup={setSelectedGroupId}
            onGroupsChange={setTakeoffGroups}
            groupTotals={groupTotals}
            liveItemCounts={liveItemCounts}
            allPageGroupTotals={allPageGroupTotals}
            sidebarWidth={isMobile ? Math.min(sidebarWidth, 320) : sidebarWidth}
            onRefreshItems={() => { refreshItems(); refreshAllPageTotals(); refreshDisciplineTotals(); }}
            onItemsAppended={appendCopiedItems}
          />
      </aside>

      {/* Mobile backdrop — tap outside to close sidebar */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main canvas area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-800 border-b border-gray-700 flex-shrink-0 flex-wrap">
          {/* Sidebar toggle */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition flex-shrink-0"
              title="Show takeoff panel"
              aria-label="Open takeoff panel"
            >
              <span className="text-base leading-none">☰</span>
              <span className="hidden sm:inline">Takeoff</span>
            </button>
          )}
          {/* Drawing selector dropdown */}
          <div className="relative mr-1">
            <button
              onClick={() => setShowDrawingSelector(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg transition max-w-[180px]"
              title="Switch drawing"
            >
              <span className="truncate">{drawing.fileName}</span>
              <svg className="w-3 h-3 flex-shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showDrawingSelector && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setShowDrawingSelector(false)} />
                <div className="absolute left-0 top-8 z-[61] bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-72 max-h-96 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {/* Group by folder */}
                  {(() => {
                    const grouped: Record<string, typeof allDrawings> = {};
                    for (const d of allDrawings) {
                      const key = d.folderName ?? "No Folder";
                      if (!grouped[key]) grouped[key] = [];
                      grouped[key].push(d);
                    }
                    return Object.entries(grouped).map(([folder, draws]) => (
                      <div key={folder}>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-700">
                          📁 {folder}
                        </div>
                        {draws.map(d => {
                          const drawingPages = pages; // current drawing pages (only for current drawing)
                          const isCurrent = d.id === drawing.id;
                          return (
                            <a
                              key={d.id}
                              href={`/dashboard/projects/${projectId}/drawings/${d.id}`}
                              onClick={() => setShowDrawingSelector(false)}
                              className={`flex items-center justify-between px-3 py-2 text-xs transition ${
                                isCurrent ? "bg-blue-600/20 text-blue-300" : "text-gray-300 hover:bg-gray-700"
                              }`}
                            >
                              <span className="truncate flex-1 mr-2">{d.fileName}</span>
                              {isCurrent && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {pages.some(p => {
                                    const act = pageActivity[p.id];
                                    return act?.hasAnnotations;
                                  }) && <span title="Has annotations/measurements">📐</span>}
                                  {pages.some(p => {
                                    const act = pageActivity[p.id];
                                    return act?.hasTakeoff;
                                  }) && <span title="Has takeoff shapes">📚</span>}
                                </div>
                              )}
                            </a>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>

          {/* Page nav */}
          <div className="flex items-center gap-1 mr-2">
            <button onClick={() => setCurrentPageIdx((i) => Math.max(0, i - 1))} disabled={currentPageIdx === 0}
              className="text-gray-600 hover:text-white disabled:opacity-30 px-1 py-0.5 rounded text-sm">‹</button>
            <span className="text-xs text-gray-300 min-w-[72px] text-center">
              {currentPage.label || `Page ${currentPage.pageNumber}`} / {pages.length}
            </span>
            <button onClick={() => setCurrentPageIdx((i) => Math.min(pages.length - 1, i + 1))} disabled={currentPageIdx === pages.length - 1}
              className="text-gray-600 hover:text-white disabled:opacity-30 px-1 py-0.5 rounded text-sm">›</button>
          </div>

          <div className="h-4 w-px bg-gray-600 mx-0.5" />

          {/* Zoom */}
          <button onClick={() => setScale((s) => Math.min(s * 1.2, 8))} className="text-gray-600 hover:text-white text-sm px-1.5 py-0.5 rounded hover:bg-gray-700">+</button>
          <span className="text-xs text-gray-600 min-w-[40px] text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.max(s / 1.2, 0.05))} className="text-gray-600 hover:text-white text-sm px-1.5 py-0.5 rounded hover:bg-gray-700">−</button>
          <button onClick={() => pdfImage && fitToStage(pdfDims.width, pdfDims.height)}
            className="text-xs text-gray-600 hover:text-white px-1.5 py-0.5 rounded hover:bg-gray-700">Fit</button>

          <div className="h-4 w-px bg-gray-600 mx-0.5" />

          {/* Mode buttons */}
          {[
            { m: "select" as Mode, label: "Select", color: "bg-blue-600" },
            { m: "calibrate" as Mode, label: "Set Scale", color: "bg-orange-500" },
            { m: "measure" as Mode, label: "📏 Measure", color: "bg-teal-600" },
            { m: "zone" as Mode, label: "+ Zone", color: "bg-green-600" },
          ].map(({ m, label, color }) => (
            <button key={m}
              onClick={() => {
                setMode(m);
                setCalibLine(null); setCalibStep("draw"); setCalibPanelMode("common");
                setLinearPts([]); setAreaRect(null);
                setMeasureAnchor(null);
              }}
              className={`text-xs px-2 py-1 rounded transition ${mode === m ? `${color} text-white` : "text-gray-600 hover:text-white hover:bg-gray-700"}`}
            >
              {label}
            </button>
          ))}

          <div className="h-4 w-px bg-gray-600 mx-0.5" />

          {/* Takeoff tools */}
          <>
            <span className="text-xs text-gray-600">Tools:</span>
            {([
              { m: "polyline" as Mode, label: "Polyline", icon: "⌇", title: "Polyline — click points, double-click to finish" },
              { m: "rectangle" as Mode, label: "Rect", icon: "▭", title: "Rectangle — drag to draw" },
              { m: "circle" as Mode, label: "Circle", icon: "○", title: "Circle — click center, drag to set radius" },
              { m: "arc" as Mode, label: "Arc", icon: "⌒", title: "Arc — click start, end, then midpoint" },
              { m: "count" as Mode, label: "Count", icon: "●", title: "Count — click to place markers" },
            ] as { m: Mode; label: string; icon: string; title: string }[]).map(({ m, label, icon, title }) => {
              const activeGrp = selectedGroupId ? takeoffGroups.find(g => g.id === selectedGroupId) : null;
              const locked = activeGrp?.isLocked ?? false;
              const disabled = !selectedGroupId || locked;
              return (
                <button key={m}
                  onClick={() => {
                    if (!selectedGroupId) { return; }
                    if (locked) return;
                    setMode(m);
                    setCalibLine(null);
                    resetDrawingState();
                    setMeasureAnchor(null);
                  }}
                  title={
                    locked ? "Layer is locked — unlock to draw" :
                    !selectedGroupId ? "Select a takeoff layer first" : title
                  }
                  className={`text-xs px-2 py-1 rounded transition flex items-center gap-1 ${
                    mode === m && !locked ? "bg-blue-600 text-white" :
                    disabled ? "text-gray-600 cursor-not-allowed opacity-50" :
                    "text-gray-600 hover:text-white hover:bg-gray-700"
                  }`}
                >
                  <span>{icon}</span>{label}
                </button>
              );
            })}

            {/* Undo/redo */}
            <div className="h-4 w-px bg-gray-600 mx-0.5" />
            <button onClick={undo} aria-label="Undo (Ctrl+Z)" className="text-gray-600 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-gray-700">↩</button>
            <button onClick={redo} aria-label="Redo (Ctrl+Y)" className="text-gray-600 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-gray-700">↪</button>

            {/* Markup tools */}
            <div className="h-4 w-px bg-gray-600 mx-0.5" />
            <span className="text-xs text-gray-600">Markup:</span>
          {([
            { m: "pen" as Mode, icon: "✏", title: "Freehand pen" },
            { m: "markup-text" as Mode, icon: "T", title: "Text label — click to place" },
            { m: "highlight" as Mode, icon: "▭", title: "Highlight — drag to draw" },
            { m: "arrow" as Mode, icon: "↗", title: "Arrow — drag to draw" },
            { m: "xline" as Mode, icon: "↔", title: "XLine — infinite construction line (Shift = 45° snap)" },
          ]).map(({ m, icon, title }) => (
            <button key={m} aria-label={title}
              onClick={() => { setMode(m); resetDrawingState(); setMeasureAnchor(null); setTextInput(null); }}
              className={`text-xs px-2 py-1 rounded transition ${mode === m ? "bg-purple-600 text-white" : "text-gray-600 hover:text-white hover:bg-gray-700"}`}
            >
              {icon}
            </button>
          ))}
          {(mode === "pen" || mode === "markup-text" || mode === "highlight" || mode === "arrow" || mode === "xline") && (
            <div className="flex items-center gap-2 border-l border-gray-600 pl-1.5">
              {/* Color swatches */}
              <div className="flex items-center gap-1">
                {["#EF4444", "#F97316", "#FBBF24", "#22C55E", "#3B82F6", "#A855F7", "#1F2937"].map(c => (
                  <button key={c} onClick={() => setMarkupColor(c)} aria-label={`Set markup color to ${c}`}
                    className={`w-4 h-4 rounded-full border-2 transition-transform ${markupColor === c ? "border-white scale-125" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {/* Stroke thickness — shown for pen and arrow only */}
              {(mode === "pen" || mode === "arrow" || mode === "xline") && (
                <div className="flex items-center gap-1 border-l border-gray-600 pl-1.5">
                  <span className="text-xs text-gray-500">Thickness:</span>
                  {[1, 2, 4, 6, 10].map(w => (
                    <button key={w} onClick={() => setMarkupStrokeWidth(w)} aria-label={`${w}px stroke width`}
                      className={`flex items-center justify-center w-6 h-5 rounded transition ${markupStrokeWidth === w ? "bg-gray-500" : "hover:bg-gray-700"}`}
                    >
                      <div className="bg-white rounded-full" style={{ width: Math.min(w, 6) * 2.5, height: Math.min(w, 6) * 2.5 }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {measurements.length > 0 && (
            <>
              <div className="h-4 w-px bg-gray-600 mx-0.5" />
              <button onClick={() => { setMeasurements([]); setSelectedMeasurementIds(new Set()); }} title="Clear all rulers"
                className="text-xs px-2 py-0.5 rounded text-teal-400 hover:text-white hover:bg-gray-700 transition">
                📏 ×{measurements.length}
              </button>
            </>
          )}
          </>

          {/* Selection count hint */}
          {(selectedItemIds.size > 0 || selectedAnnotationIds.size > 0) && (
            <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 bg-blue-900/60 border border-blue-700 rounded text-xs text-blue-200">
              <span>{selectedItemIds.size + selectedAnnotationIds.size} selected</span>
              <span className="text-blue-400">·</span>
              <button onClick={() => { setSelectedItemIds(new Set()); setSelectedAnnotationIds(new Set()); }}
                className="text-blue-300 hover:text-white transition" title="Clear selection (Esc)">
                Esc to clear
              </button>
            </div>
          )}

          {/* Scale + active group info + active users */}
          <div className="ml-auto flex items-center gap-3 text-xs">
            {selectedGroupId && (() => {
              const activeGrp = takeoffGroups.find((g) => g.id === selectedGroupId);
              return (
                <span className="flex items-center gap-1.5 text-gray-600">
                  Layer:
                  <span style={{ color: activeGrp?.colour ?? "#fff" }} className="font-medium">
                    {activeGrp?.name ?? ""}
                  </span>
                  {activeGrp?.isLocked && (
                    <span className="flex items-center gap-1 bg-red-900/60 text-red-300 border border-red-700 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                      🔒 Locked — drawing disabled
                    </span>
                  )}
                </span>
              );
            })()}
            {currentPage.scale
              ? <span className="text-gray-500">Scale: <span className="text-gray-300">{scaleLabel(currentPage.scale, currentPage.scaleUnit)}</span></span>
              : <span className="text-yellow-500">No scale set</span>}

            {/* Connection status — only show when disconnected */}
            {!socketConnected && (
              <span className="flex items-center gap-1 text-yellow-400 text-xs" title="Reconnecting…">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                Reconnecting…
              </span>
            )}

            {/* Active users presence */}
            {activeUsers.length > 0 && (
              <div className="flex items-center gap-1 pl-1 border-l border-gray-700">
                {activeUsers.slice(0, 5).map((u) => (
                  <div key={u.socketId} title={u.name}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-semibold text-[10px] flex-shrink-0 ${avatarBg(u.userId)}`}>
                    {u.initials}
                  </div>
                ))}
                {activeUsers.length > 5 && (
                  <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-gray-300 text-[10px] font-semibold">
                    +{activeUsers.length - 5}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden bg-gray-900" style={{ cursor }}>
          {pdfLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Rendering PDF…
              </div>
            </div>
          )}
          {pdfError && (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm">{pdfError}</div>
          )}
          {itemsLoadError && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-red-900/90 border border-red-600 text-red-200 text-xs px-3 py-2 rounded-lg shadow-lg">
              <span>⚠ {itemsLoadError}</span>
              <button onClick={refreshItems} className="underline hover:text-white ml-1">Retry</button>
            </div>
          )}

          {!pdfLoading && !pdfError && pdfImage && (
            <Stage
              width={stageSize.width}
              height={stageSize.height}
              x={stagePos.x}
              y={stagePos.y}
              scaleX={scale}
              scaleY={scale}
              onWheel={handleWheel}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
              onClick={handleStageClick}
              onContextMenu={(e) => e.evt.preventDefault()}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Layer 0: PDF background */}
              <Layer>
                <KonvaImage image={pdfImage} width={pdfDims.width} height={pdfDims.height} x={0} y={0} />
              </Layer>

              {/* Layer 1: Scale zones */}
              <Layer>
                {visibleZones.map((z) => (
                  <Group key={z.id}>
                    <Rect x={z.x} y={z.y} width={z.width} height={z.height}
                      fill="rgba(59,130,246,0.12)" stroke="#3B82F6" strokeWidth={1 / scale}
                      dash={[6 / scale, 3 / scale]} />
                    <Text x={z.x + 4 / scale} y={z.y + 4 / scale}
                      text={z.label ? `${z.label} · ${z.scale} ${z.scaleUnit}/px` : `${z.scale.toFixed(5)} ${z.scaleUnit}/px`}
                      fontSize={12 / scale} fill="#93C5FD" />
                  </Group>
                ))}
                {mode === "zone" && zoneRect && zoneRect.width > 2 && zoneRect.height > 2 && (
                  <Rect x={zoneRect.x} y={zoneRect.y} width={zoneRect.width} height={zoneRect.height}
                    fill="rgba(34,197,94,0.12)" stroke="#22C55E" strokeWidth={1.5 / scale}
                    dash={[6 / scale, 3 / scale]} />
                )}
                {mode === "calibrate" && calibLine && (
                  <>
                    <Line points={[calibLine.x1, calibLine.y1, calibLine.x2, calibLine.y2]}
                      stroke="#F97316" strokeWidth={2 / scale} />
                    <Rect x={calibLine.x1 - 4 / scale} y={calibLine.y1 - 4 / scale} width={8 / scale} height={8 / scale} fill="#F97316" />
                    <Rect x={calibLine.x2 - 4 / scale} y={calibLine.y2 - 4 / scale} width={8 / scale} height={8 / scale} fill="#F97316" />
                  </>
                )}
              </Layer>

              {/* Layer 2: Takeoff items */}
              <Layer>
                {visibleItems.map((item) => {
                  const groupDef = takeoffGroups.find((g) => g.id === item.groupId);
                  const color = groupDef?.colour ?? "#3B82F6";
                  const lw = (groupDef?.lineWidth ?? 2) / scale;
                  const isSelected = selectedItemIds.has(item.id);
                  const isLocked = item.isLocked || groupDef?.isLocked;
                  const remoteLock = shapeLocks.get(item.id);
                  // Use live pts during node drag, otherwise use stored pts
                  const pts = nodeEditState?.itemId === item.id ? nodeEditState.pts : item.toolData.points;
                  const { qty: _lqQty, unit: _lqUnit } = liveQty(item, groupDef);
                  const qtyText = `${_lqUnit === "each" ? Math.round(_lqQty) : _lqQty.toFixed(2)} ${_lqUnit}`;
                  // Draggable node circles — only for single selection (multi-select disables node drag)
                  const showNodes = mode === "select" && isSelected && !isLocked && selectedItemIds.size === 1;
                  const draggableNodes = showNodes ? pts.map((p, nodeIdx) => (
                    <Circle key={`node-${nodeIdx}`}
                      x={p.x} y={p.y} radius={7 / scale}
                      fill={SEL} stroke="#0369A1" strokeWidth={2 / scale}
                      draggable
                      onDragStart={(e) => {
                        e.cancelBubble = true;
                        nodeEditRef.current = { itemId: item.id, pts: [...pts] };
                      }}
                      onDragMove={(e) => {
                        e.cancelBubble = true;
                        const np = [...(nodeEditRef.current?.pts ?? pts)];
                        np[nodeIdx] = { x: e.target.x(), y: e.target.y() };
                        nodeEditRef.current = { itemId: item.id, pts: np };
                        setNodeEditState({ itemId: item.id, pts: [...np] });
                      }}
                      onDragEnd={(e) => {
                        e.cancelBubble = true; // prevent bubbling to Stage onDragEnd which corrupts stagePos
                        const fp = nodeEditRef.current?.pts ?? pts;
                        nodeEditRef.current = null;
                        saveNodeEdit(item, [...fp]); // clears nodeEditState in finally
                      }}
                    />
                  )) : null;

                  function handleItemClick(e: Konva.KonvaEventObject<MouseEvent>) {
                    if (mode !== "select") return;
                    e.cancelBubble = true;
                    if (isShiftHeld.current) {
                      setSelectedItemIds(prev => {
                        const n = new Set(prev);
                        n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                        return n;
                      });
                    } else {
                      setSelectedItemIds(prev =>
                        prev.size === 1 && prev.has(item.id) ? new Set() : new Set([item.id])
                      );
                    }
                  }

                  const groupType = item.group?.type ?? item.toolType;
                  const shape = item.shapeType;

                  // Lock overlay — shown when another user has this shape locked
                  const lockOverlay = remoteLock && remoteLock.userId !== currentUser.id ? (() => {
                    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
                    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
                    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
                    const label = `✎ ${remoteLock.name}`;
                    return (
                      <Group listening={false}>
                        <Rect x={cx - label.length * 3.5 / scale} y={cy - 10 / scale}
                          width={label.length * 7 / scale} height={14 / scale}
                          fill="#1e293b" opacity={0.85} cornerRadius={3 / scale} />
                        <Text x={cx - label.length * 3.5 / scale} y={cy - 9 / scale}
                          text={label} fontSize={10 / scale} fill="#f8fafc" />
                      </Group>
                    );
                  })() : null;

                  // COUNT markers — shape + size from group settings
                  if (groupType === "COUNT") {
                    const ap = groupDef?.additionalParams as Record<string, unknown> | null;
                    const markerShape = (ap?.countShape as string) ?? "circle";
                    const r = (2 + (groupDef?.lineWidth ?? 2) * 2) / scale;
                    const fill = isSelected ? SEL : color;
                    const stroke = isSelected ? "#0369A1" : "white";
                    const sw = isSelected ? 2.5 / scale : 1 / scale;
                    const commonProps = { fill, stroke, strokeWidth: sw, hitStrokeWidth: 12 / scale } as const;
                    return (
                      <Group key={item.id} onClick={handleItemClick} opacity={remoteLock && remoteLock.userId !== currentUser.id ? 0.4 : 1}>
                        {pts.map((p, i) => {
                          if (markerShape === "square")
                            return <Rect key={`sq-${i}-${p.x}-${p.y}`} x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} {...commonProps} />;
                          if (markerShape === "triangle")
                            return <RegularPolygon key={`tri-${i}-${p.x}-${p.y}`} x={p.x} y={p.y} sides={3} radius={r} rotation={0} {...commonProps} />;
                          if (markerShape === "diamond")
                            return <RegularPolygon key={`dia-${i}-${p.x}-${p.y}`} x={p.x} y={p.y} sides={4} radius={r} rotation={45} {...commonProps} />;
                          if (markerShape === "cross")
                            return (
                              <Group key={`cross-${i}-${p.x}-${p.y}`} x={p.x} y={p.y}>
                                <Line points={[-r, 0, r, 0]} stroke={fill} strokeWidth={sw * 3} lineCap="round" />
                                <Line points={[0, -r, 0, r]} stroke={fill} strokeWidth={sw * 3} lineCap="round" />
                              </Group>
                            );
                          if (markerShape === "star")
                            return <Star key={`star-${i}-${p.x}-${p.y}`} x={p.x} y={p.y} numPoints={5} innerRadius={r * 0.45} outerRadius={r} rotation={-18} {...commonProps} />;
                          // default: circle
                          return <Circle key={`dot-${i}-${p.x}-${p.y}`} x={p.x} y={p.y} radius={r} {...commonProps} />;
                        })}
                        {draggableNodes}
                        {lockOverlay}
                      </Group>
                    );
                  }

                  // CIRCLE shape
                  if (shape === "CIRCLE" && pts.length >= 2) {
                    const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
                    const r = Math.sqrt(dx * dx + dy * dy);
                    const isFilled = groupType === "AREA" || groupType === "VOLUME";
                    return (
                      <Group key={item.id} onClick={handleItemClick} opacity={remoteLock && remoteLock.userId !== currentUser.id ? 0.4 : 1}>
                        {isSelected && (
                          <Circle x={pts[0].x} y={pts[0].y} radius={r + 3 / scale}
                            stroke={SEL} strokeWidth={2 / scale} fill="transparent"
                            dash={[8 / scale, 4 / scale]} listening={false} />
                        )}
                        <Circle x={pts[0].x} y={pts[0].y} radius={r}
                          stroke={color} strokeWidth={lw}
                          fill={isFilled ? color + (isSelected ? "66" : "22") : "transparent"}
                          hitStrokeWidth={12 / scale}
                        />
                        <Text x={pts[0].x + r + 4 / scale} y={pts[0].y - 14 / scale}
                          text={qtyText}
                          fontSize={11 / scale} fill={color} />
                        {draggableNodes}
                        {lockOverlay}
                      </Group>
                    );
                  }

                  // ARC shape — pts stored as [start, end, midpoint-on-arc]
                  if (shape === "ARC" && pts.length >= 3) {
                    const [arcStart, arcEnd, arcMid] = pts;
                    // Bezier control point: curve passes through arcMid at t=0.5
                    const ctrlX = 2 * arcMid.x - 0.5 * (arcStart.x + arcEnd.x);
                    const ctrlY = 2 * arcMid.y - 0.5 * (arcStart.y + arcEnd.y);
                    const labelX = (arcStart.x + arcEnd.x) / 2;
                    const labelY = (arcStart.y + arcEnd.y) / 2;
                    return (
                      <Group key={item.id} onClick={handleItemClick} opacity={remoteLock && remoteLock.userId !== currentUser.id ? 0.4 : 1}>
                        <Path
                          data={`M ${arcStart.x} ${arcStart.y} Q ${ctrlX} ${ctrlY} ${arcEnd.x} ${arcEnd.y}`}
                          stroke={isSelected ? SEL : color}
                          strokeWidth={isSelected ? lw + 2 / scale : lw}
                          fill="transparent"
                          dash={isSelected ? [8 / scale, 4 / scale] : undefined}
                          hitStrokeWidth={12 / scale}
                          onClick={handleItemClick}
                        />
                        <Text x={labelX + 4 / scale} y={labelY - 14 / scale}
                          text={qtyText}
                          fontSize={11 / scale} fill={color} />
                        {draggableNodes}
                        {lockOverlay}
                      </Group>
                    );
                  }

                  // POLYLINE / POLYGON / RECTANGLE shapes
                  {
                    const isFilled = groupType === "AREA" || groupType === "VOLUME";
                    const isClosed = isFilled || shape === "RECTANGLE" || shape === "POLYGON";
                    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
                    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
                    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
                    const midIdx = Math.floor(pts.length / 2);
                    return (
                      <Group key={item.id} onClick={handleItemClick} opacity={remoteLock && remoteLock.userId !== currentUser.id ? 0.4 : 1}>
                        {isSelected && (
                          <Line points={pts.flatMap(p => [p.x, p.y])}
                            stroke={SEL} strokeWidth={(lw * 2) + 4 / scale}
                            lineJoin="round" lineCap="round"
                            closed={isClosed} fill="transparent"
                            dash={[10 / scale, 5 / scale]}
                            listening={false} />
                        )}
                        <Line
                          points={pts.flatMap(p => [p.x, p.y])}
                          stroke={color} strokeWidth={lw}
                          lineJoin="round" lineCap="round"
                          closed={isClosed}
                          fill={isFilled ? color + (isSelected ? "66" : "22") : "transparent"}
                          hitStrokeWidth={12 / scale}
                        />
                        {draggableNodes}
                        <Text
                          x={isFilled ? cx : pts[midIdx].x + 4 / scale}
                          y={isFilled ? cy : pts[midIdx].y - 14 / scale}
                          text={qtyText}
                          fontSize={11 / scale} fill={color}
                          align={isFilled ? "center" : "left"}
                          offsetX={isFilled ? 20 / scale : 0}
                        />
                        {lockOverlay}
                      </Group>
                    );
                  }
                })}

                {/* Rulers — always visible regardless of active mode, selectable + node-editable */}
                <>
                  {measurements.map((m) => {
                      const live = measureNodeEdit?.id === m.id ? measureNodeEdit : m;
                      const { start: s, end: e2 } = live;
                      const dx = e2.x - s.x, dy = e2.y - s.y;
                      const pxLen = Math.sqrt(dx * dx + dy * dy);
                      const lbl = currentPage.scale
                        ? (currentPage.scaleUnit === "ft" ? ftToFeetIn(pxLen * currentPage.scale) : `${(pxLen * currentPage.scale).toFixed(2)} ${currentPage.scaleUnit}`)
                        : `${pxLen.toFixed(0)} px`;
                      const mx = (s.x + e2.x) / 2, my = (s.y + e2.y) / 2;
                      const isSel = selectedMeasurementIds.has(m.id);
                      const lineColor = isSel ? SEL : "#F97316";
                      const tickColor = isSel ? SEL : "#F97316";
                      return (
                        <Group key={m.id}>
                          {/* Wide transparent hit area for easy clicking */}
                          <Line points={[s.x, s.y, e2.x, e2.y]} stroke="transparent" strokeWidth={14/scale}
                            onClick={(ev) => {
                              ev.cancelBubble = true;
                              if (isShiftHeld.current) {
                                setSelectedMeasurementIds(prev => {
                                  const n = new Set(prev);
                                  n.has(m.id) ? n.delete(m.id) : n.add(m.id);
                                  return n;
                                });
                              } else {
                                setSelectedMeasurementIds(prev =>
                                  prev.size === 1 && prev.has(m.id) ? new Set() : new Set([m.id])
                                );
                              }
                            }}
                          />
                          {/* Visible ruler line */}
                          <Line points={[s.x, s.y, e2.x, e2.y]} stroke={lineColor} strokeWidth={2/scale} dash={[6/scale, 3/scale]} listening={false} />
                          {/* Start tick */}
                          <Line points={[s.x - 4/scale, s.y, s.x + 4/scale, s.y]} stroke={tickColor} strokeWidth={2/scale} listening={false} />
                          <Line points={[s.x, s.y - 4/scale, s.x, s.y + 4/scale]} stroke={tickColor} strokeWidth={2/scale} listening={false} />
                          {pxLen > 5 && (
                            <>
                              {/* End tick */}
                              <Line points={[e2.x - 4/scale, e2.y, e2.x + 4/scale, e2.y]} stroke={tickColor} strokeWidth={2/scale} listening={false} />
                              <Line points={[e2.x, e2.y - 4/scale, e2.x, e2.y + 4/scale]} stroke={tickColor} strokeWidth={2/scale} listening={false} />
                              {/* Label */}
                              <Rect x={mx - 2/scale} y={my - 16/scale} width={lbl.length * 6.5/scale} height={14/scale} fill="white" opacity={0.85} cornerRadius={2/scale} listening={false} />
                              <Text x={mx} y={my - 14/scale} text={lbl} fontSize={11/scale} fill={isSel ? "#0369A1" : "#EA580C"} fontStyle="bold" listening={false} />
                            </>
                          )}
                          {/* Endpoint node handles — only when this is the sole selected ruler */}
                          {isSel && selectedMeasurementIds.size === 1 && ([
                            { pt: s, isStart: true },
                            { pt: e2, isStart: false },
                          ] as { pt: Point; isStart: boolean }[]).map(({ pt, isStart }) => (
                            <Circle key={isStart ? "s" : "e"} x={pt.x} y={pt.y} radius={7/scale}
                              fill={SEL} stroke="#0369A1" strokeWidth={2/scale}
                              draggable
                              onDragStart={(ev) => {
                                ev.cancelBubble = true;
                                measureNodeEditRef.current = { id: m.id, start: s, end: e2 };
                              }}
                              onDragMove={(ev) => {
                                ev.cancelBubble = true;
                                const cur = { ...(measureNodeEditRef.current ?? { id: m.id, start: s, end: e2 }) };
                                const newPt = { x: ev.target.x(), y: ev.target.y() };
                                if (isStart) cur.start = newPt; else cur.end = newPt;
                                measureNodeEditRef.current = cur;
                                setMeasureNodeEdit({ ...cur });
                              }}
                              onDragEnd={(ev) => {
                                ev.cancelBubble = true;
                                const final = measureNodeEditRef.current ?? { id: m.id, start: s, end: e2 };
                                measureNodeEditRef.current = null;
                                setMeasureNodeEdit(null);
                                setMeasurements(prev => prev.map(r => r.id === m.id ? { ...r, start: final.start, end: final.end } : r));
                              }}
                            />
                          ))}
                        </Group>
                      );
                    })}
                    {/* In-progress ruler — only while in measure mode */}
                    {mode === "measure" && measureAnchor && mousePos && (() => {
                      const end = mousePos;
                      const dx = end.x - measureAnchor.x, dy = end.y - measureAnchor.y;
                      const pxLen = Math.sqrt(dx * dx + dy * dy);
                      const lbl = currentPage.scale
                        ? (currentPage.scaleUnit === "ft" ? ftToFeetIn(pxLen * currentPage.scale) : `${(pxLen * currentPage.scale).toFixed(2)} ${currentPage.scaleUnit}`)
                        : `${pxLen.toFixed(0)} px`;
                      const mx = (measureAnchor.x + end.x) / 2, my = (measureAnchor.y + end.y) / 2;
                      return (
                        <Group listening={false}>
                          <Line points={[measureAnchor.x, measureAnchor.y, end.x, end.y]} stroke="#F97316" strokeWidth={2/scale} dash={[6/scale, 3/scale]} />
                          <Line points={[measureAnchor.x - 4/scale, measureAnchor.y, measureAnchor.x + 4/scale, measureAnchor.y]} stroke="#F97316" strokeWidth={2/scale} />
                          <Line points={[measureAnchor.x, measureAnchor.y - 4/scale, measureAnchor.x, measureAnchor.y + 4/scale]} stroke="#F97316" strokeWidth={2/scale} />
                          <Circle x={measureAnchor.x} y={measureAnchor.y} radius={4/scale} fill="#F97316" />
                          {pxLen > 5 && (
                            <>
                              <Line points={[end.x - 4/scale, end.y, end.x + 4/scale, end.y]} stroke="#F97316" strokeWidth={2/scale} />
                              <Line points={[end.x, end.y - 4/scale, end.x, end.y + 4/scale]} stroke="#F97316" strokeWidth={2/scale} />
                              <Rect x={mx - 2/scale} y={my - 16/scale} width={lbl.length * 6.5/scale} height={14/scale} fill="white" opacity={0.85} cornerRadius={2/scale} />
                              <Text x={mx} y={my - 14/scale} text={lbl} fontSize={11/scale} fill="#F97316" fontStyle="bold" />
                            </>
                          )}
                        </Group>
                      );
                    })()}
                </>

                {/* Polyline: in-progress */}
                {mode === "polyline" && linearPoints.length > 0 && (() => {
                  const col = takeoffGroups.find(g => g.id === selectedGroupId)?.colour ?? "#3B82F6";
                  return (
                    <Group>
                      <Line
                        points={[...linearPoints.flatMap(p => [p.x, p.y]), ...(mousePos ? [mousePos.x, mousePos.y] : [])]}
                        stroke={col} strokeWidth={2 / scale} dash={[6 / scale, 3 / scale]} lineJoin="round"
                      />
                      {linearPoints.map((p, i) => <Circle key={`lp-${i}-${p.x}-${p.y}`} x={p.x} y={p.y} radius={4 / scale} fill={col} />)}
                      {linearPoints.length >= 1 && mousePos && (
                        <Text
                          x={(mousePos.x + linearPoints[linearPoints.length - 1].x) / 2 + 4 / scale}
                          y={(mousePos.y + linearPoints[linearPoints.length - 1].y) / 2 - 14 / scale}
                          text={previewLength([...linearPoints, mousePos])}
                          fontSize={11 / scale} fill="#60A5FA"
                        />
                      )}
                    </Group>
                  );
                })()}

                {/* Rectangle: in-progress drag */}
                {mode === "rectangle" && areaRect && areaRect.width > 2 && areaRect.height > 2 && (() => {
                  const col = takeoffGroups.find(g => g.id === selectedGroupId)?.colour ?? "#3B82F6";
                  return (
                    <Group>
                      <Rect x={areaRect.x} y={areaRect.y} width={areaRect.width} height={areaRect.height}
                        stroke={col} strokeWidth={2 / scale} fill={col + "22"} dash={[6 / scale, 3 / scale]} />
                      <Text x={areaRect.x + areaRect.width / 2} y={areaRect.y + areaRect.height / 2}
                        text={previewArea(areaRect)} fontSize={11 / scale} fill="#60A5FA" align="center" offsetX={20 / scale} />
                    </Group>
                  );
                })()}

                {/* Circle: in-progress drag */}
                {mode === "circle" && circlePreview && circlePreview.r > 2 && (() => {
                  const col = takeoffGroups.find(g => g.id === selectedGroupId)?.colour ?? "#3B82F6";
                  const { cx, cy, r } = circlePreview;
                  return (
                    <Group>
                      <Circle x={cx} y={cy} radius={r} stroke={col} strokeWidth={2 / scale}
                        fill={col + "22"} dash={[6 / scale, 3 / scale]} />
                      <Circle x={cx} y={cy} radius={4 / scale} fill={col} />
                      <Text x={cx + r + 4 / scale} y={cy - 14 / scale}
                        text={currentPage.scale ? `r = ${(r * currentPage.scale).toFixed(2)} ${currentPage.scaleUnit}` : ""}
                        fontSize={11 / scale} fill="#60A5FA" />
                    </Group>
                  );
                })()}

                {/* Arc: in-progress (shows placed points + preview arc with mouse as tentative midpoint) */}
                {mode === "arc" && arcPoints.length > 0 && (() => {
                  const col = takeoffGroups.find(g => g.id === selectedGroupId)?.colour ?? "#3B82F6";
                  return (
                    <Group>
                      {arcPoints.map((p, i) => <Circle key={`ap-${i}-${p.x}-${p.y}`} x={p.x} y={p.y} radius={5 / scale} fill={col} />)}
                      {arcPoints.length === 1 && mousePos && (
                        <Line points={[arcPoints[0].x, arcPoints[0].y, mousePos.x, mousePos.y]}
                          stroke={col} strokeWidth={1.5 / scale} dash={[6 / scale, 3 / scale]} />
                      )}
                      {arcPoints.length === 2 && mousePos && (() => {
                        const [p0, p2] = arcPoints;
                        const p1 = mousePos;
                        const ctrlX = 2 * p1.x - 0.5 * (p0.x + p2.x);
                        const ctrlY = 2 * p1.y - 0.5 * (p0.y + p2.y);
                        return (
                          <Path data={`M ${p0.x} ${p0.y} Q ${ctrlX} ${ctrlY} ${p2.x} ${p2.y}`}
                            stroke={col} strokeWidth={2 / scale} fill="transparent" dash={[6 / scale, 3 / scale]} />
                        );
                      })()}
                    </Group>
                  );
                })()}

                {/* OSNAP indicator — shown in all drawing modes */}
                {snapCandidate && mode !== "select" && mode !== "markup-text" && mode !== "pen" && mode !== "highlight" && (() => {
                  const { point: p, type } = snapCandidate;
                  const r = 8 / scale;
                  const sw = 1.5 / scale;
                  if (type === "endpoint") return (
                    // Green square — endpoint
                    <Rect x={p.x - r} y={p.y - r} width={r * 2} height={r * 2}
                      stroke="#22C55E" strokeWidth={sw} fill="#22C55E22" listening={false} />
                  );
                  if (type === "midpoint") return (
                    // Orange triangle — midpoint
                    <RegularPolygon x={p.x} y={p.y} sides={3} radius={r}
                      stroke="#F97316" strokeWidth={sw} fill="#F9731622" rotation={0} listening={false} />
                  );
                  if (type === "center") return (
                    // Cyan crosshair circle — center
                    <Group listening={false}>
                      <Circle x={p.x} y={p.y} radius={r} stroke="#06B6D4" strokeWidth={sw} fill="#06B6D422" />
                      <Line points={[p.x - r * 1.4, p.y, p.x + r * 1.4, p.y]} stroke="#06B6D4" strokeWidth={sw} />
                      <Line points={[p.x, p.y - r * 1.4, p.x, p.y + r * 1.4]} stroke="#06B6D4" strokeWidth={sw} />
                    </Group>
                  );
                  return null;
                })()}
              </Layer>

{/* Layer 3: Markup annotations — clipped to PDF bounds */}
              <Layer>
                <Group clip={{ x: 0, y: 0, width: pdfDims.width, height: pdfDims.height }}>
                {annotations.map((ann) => {
                  const isSel = selectedAnnotationIds.has(ann.id);
                  function onAnnClick(e: Konva.KonvaEventObject<MouseEvent>) {
                    if (mode !== "select") return;
                    e.cancelBubble = true;
                    if (isShiftHeld.current) {
                      setSelectedAnnotationIds(prev => { const n = new Set(prev); n.has(ann.id) ? n.delete(ann.id) : n.add(ann.id); return n; });
                    } else {
                      setSelectedAnnotationIds(prev => prev.size === 1 && prev.has(ann.id) ? new Set() : new Set([ann.id]));
                    }
                  }
                  if (ann.type === "pen") return (
                    <Line key={ann.id} points={ann.points} stroke={isSel ? SEL : ann.color}
                      strokeWidth={ann.strokeWidth / scale} lineCap="round" lineJoin="round"
                      tension={0.5} hitStrokeWidth={10 / scale} onClick={onAnnClick} />
                  );
                  if (ann.type === "text") return (
                    <Text key={ann.id} x={ann.x} y={ann.y} text={ann.text}
                      fontSize={ann.fontSize / scale} fill={isSel ? SEL : ann.color}
                      hitStrokeWidth={10 / scale} onClick={onAnnClick} />
                  );
                  if (ann.type === "highlight") return (
                    <Rect key={ann.id} x={ann.x} y={ann.y} width={ann.width} height={ann.height}
                      fill={ann.color + "40"} stroke={isSel ? SEL : ann.color + "99"}
                      strokeWidth={1 / scale} onClick={onAnnClick} />
                  );
                  if (ann.type === "arrow") return (
                    <Arrow key={ann.id} points={[ann.x1, ann.y1, ann.x2, ann.y2]}
                      stroke={isSel ? SEL : ann.color} fill={isSel ? SEL : ann.color}
                      strokeWidth={ann.strokeWidth / scale}
                      pointerLength={12 / scale} pointerWidth={8 / scale}
                      hitStrokeWidth={10 / scale} onClick={onAnnClick} />
                  );
                  if (ann.type === "xline") {
                    const dx = ann.x2 - ann.x1, dy = ann.y2 - ann.y1;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len < 0.001) return null;
                    // Extend only to 3× the PDF page size — avoids Konva precision issues
                    // while still appearing infinite on screen
                    const BIG = Math.max(pdfDims.width, pdfDims.height) * 3 / scale;
                    const ux = dx/len, uy = dy/len;
                    const x1e = ann.x1 - ux*BIG, y1e = ann.y1 - uy*BIG;
                    const x2e = ann.x1 + ux*BIG, y2e = ann.y1 + uy*BIG;
                    const c = isSel ? SEL : ann.color;
                    const sw = ann.strokeWidth / scale;
                    // Wide invisible hit line for easy selection, visible dashed line on top
                    return (
                      <Group key={ann.id}>
                        <Line points={[x1e, y1e, x2e, y2e]}
                          stroke="transparent" strokeWidth={24/scale}
                          onClick={onAnnClick} hitStrokeWidth={24/scale} />
                        <Line points={[x1e, y1e, x2e, y2e]} stroke={c} strokeWidth={sw}
                          dash={[12/scale, 4/scale]} lineCap="round" listening={false}
                          strokeScaleEnabled={false} />
                        <Arrow points={[x1e+ux*20/scale, y1e+uy*20/scale, x1e, y1e]}
                          stroke={c} fill={c} strokeWidth={sw}
                          pointerLength={10/scale} pointerWidth={7/scale} listening={false} />
                        <Arrow points={[x2e-ux*20/scale, y2e-uy*20/scale, x2e, y2e]}
                          stroke={c} fill={c} strokeWidth={sw}
                          pointerLength={10/scale} pointerWidth={7/scale} listening={false} />
                        {isSel && (
                          <Line points={[x1e, y1e, x2e, y2e]}
                            stroke={SEL} strokeWidth={2/scale} dash={[6/scale, 3/scale]}
                            opacity={0.6} listening={false} />
                        )}
                      </Group>
                    );
                  }
                  return null;
                })}

                {/* In-progress drafts */}
                {mode === "pen" && penDraft && penDraft.length >= 4 && (
                  <Line points={penDraft} stroke={markupColor} strokeWidth={markupStrokeWidth / scale}
                    lineCap="round" lineJoin="round" tension={0.5} listening={false} />
                )}
                {mode === "highlight" && highlightDraft && highlightDraft.width > 2 && highlightDraft.height > 2 && (
                  <Rect x={highlightDraft.x} y={highlightDraft.y} width={highlightDraft.width} height={highlightDraft.height}
                    fill={markupColor + "40"} stroke={markupColor + "99"} strokeWidth={1 / scale} listening={false} />
                )}
                {mode === "arrow" && arrowDraft && (() => {
                  const dx = arrowDraft.x2 - arrowDraft.x1, dy = arrowDraft.y2 - arrowDraft.y1;
                  if (Math.sqrt(dx * dx + dy * dy) < 3) return null;
                  return (
                    <Arrow points={[arrowDraft.x1, arrowDraft.y1, arrowDraft.x2, arrowDraft.y2]}
                      stroke={markupColor} fill={markupColor} strokeWidth={markupStrokeWidth / scale}
                      pointerLength={12 / scale} pointerWidth={8 / scale} listening={false} />
                  );
                })()}
                {mode === "xline" && xlineDraft && (() => {
                  const dx = xlineDraft.x2 - xlineDraft.x1, dy = xlineDraft.y2 - xlineDraft.y1;
                  const len = Math.sqrt(dx*dx + dy*dy);
                  if (len < 3) return null;
                  const BIG = Math.max(pdfDims.width, pdfDims.height) * 3 / scale;
                  const ux = dx/len, uy = dy/len;
                  const x1e = xlineDraft.x1 - ux*BIG, y1e = xlineDraft.y1 - uy*BIG;
                  const x2e = xlineDraft.x1 + ux*BIG, y2e = xlineDraft.y1 + uy*BIG;
                  return (
                    <Group listening={false}>
                      <Line points={[x1e, y1e, x2e, y2e]} stroke={markupColor}
                        strokeWidth={markupStrokeWidth / scale}
                        dash={[12/scale, 4/scale]} lineCap="round" />
                      <Arrow points={[x1e+ux*20/scale, y1e+uy*20/scale, x1e, y1e]}
                        stroke={markupColor} fill={markupColor} strokeWidth={markupStrokeWidth / scale}
                        pointerLength={10/scale} pointerWidth={7/scale} />
                      <Arrow points={[x2e-ux*20/scale, y2e-uy*20/scale, x2e, y2e]}
                        stroke={markupColor} fill={markupColor} strokeWidth={markupStrokeWidth / scale}
                        pointerLength={10/scale} pointerWidth={7/scale} />
                    </Group>
                  );
                })()}
                </Group>
              </Layer>

              {/* Layer 4: Rubber-band selection rect */}
              <Layer>
                {rubberBand && rubberBand.width > 2 && rubberBand.height > 2 && (
                  <Rect
                    x={rubberBand.x} y={rubberBand.y}
                    width={rubberBand.width} height={rubberBand.height}
                    fill="rgba(59,130,246,0.08)"
                    stroke="#3B82F6"
                    strokeWidth={1 / scale}
                    dash={[6 / scale, 3 / scale]}
                  />
                )}
              </Layer>
            </Stage>
          )}

          {/* Page thumbnails */}
          {pages.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-gray-900/80 rounded-lg px-3 py-2 backdrop-blur-sm">
              {pages.map((p, i) => (
                <button key={p.id} onClick={() => setCurrentPageIdx(i)}
                  className={`w-7 h-7 text-xs rounded transition ${i === currentPageIdx ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-600 hover:bg-gray-600"}`}>
                  {p.pageNumber}
                </button>
              ))}
            </div>
          )}

          {/* Scale zones sidebar */}
          {currentPage.scaleZones.length > 0 && (
            <div className="absolute right-0 top-12 w-52 bg-gray-800/95 border-l border-gray-700 p-3 overflow-y-auto max-h-64">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Scale Zones</p>
              {currentPage.scaleZones.map((z) => (
                <div key={z.id} className="flex items-center justify-between text-xs text-gray-300 mb-1.5">
                  <span className="truncate mr-2">{z.label || "Zone"} · {z.scale.toFixed(4)} {z.scaleUnit}</span>
                  <button onClick={() => handleZoneDeleted(z.id)} className="text-red-400 hover:text-red-300 flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Scale panel */}
          {mode === "calibrate" && (
            <DrawingScalePanel
              pixelLength={
                calibLine && calibStep === "input"
                  ? Math.sqrt((calibLine.x2 - calibLine.x1) ** 2 + (calibLine.y2 - calibLine.y1) ** 2)
                  : null
              }
              currentUnit={currentPage.scaleUnit}
              onSubModeChange={handleCalibPanelModeChange}
              onApplyCommon={handleApplyCommon}
              onApplyManual={handleApplyManual}
              onCancel={() => { setMode("select"); setCalibLine(null); setCalibStep("draw"); setCalibPanelMode("common"); }}
            />
          )}

          {/* Zone panel */}
          {showZonePanel && zoneRect && (
            <ScaleZonePanel
              defaultUnit={currentPage.scaleUnit || "m"}
              defaultScale={currentPage.scale ?? undefined}
              onSave={handleZoneSaved}
              onCancel={() => { setShowZonePanel(false); setZoneRect(null); setMode("select"); }}
            />
          )}

          {/* Tool hints */}
          {mode === "polyline" && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <div className="bg-blue-900/90 text-blue-200 text-xs px-4 py-2 rounded-lg pointer-events-none">
                {selectedGroupId
                  ? linearPoints.length === 0
                    ? "Click to start — keep clicking to add points — double-click to finish"
                    : `${linearPoints.length} pt${linearPoints.length !== 1 ? "s" : ""} · double-click or Enter to finish · Backspace = undo last`
                  : "Select a takeoff layer first"}
              </div>
              {selectedGroupId && linearPoints.length >= 2 && (
                <button onClick={finishPolyline}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-2 rounded-lg transition font-semibold">
                  ✓ Finish (Enter)
                </button>
              )}
            </div>
          )}
          {mode === "rectangle" && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-900/90 text-blue-200 text-xs px-4 py-2 rounded-lg pointer-events-none">
              {selectedGroupId ? "Drag to draw rectangle — release to save" : "Select a takeoff layer first"}
            </div>
          )}
          {mode === "circle" && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-900/90 text-blue-200 text-xs px-4 py-2 rounded-lg pointer-events-none">
              {selectedGroupId ? "Click center — drag to set radius — release to save" : "Select a takeoff layer first"}
            </div>
          )}
          {mode === "arc" && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-900/90 text-blue-200 text-xs px-4 py-2 rounded-lg pointer-events-none">
              {selectedGroupId
                ? arcPoints.length === 0 ? "Click start point of arc"
                : arcPoints.length === 1 ? "Click end point of arc"
                : "Click midpoint on arc to finish"
                : "Select a takeoff layer first"}
            </div>
          )}
          {mode === "count" && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-900/90 text-blue-200 text-xs px-4 py-2 rounded-lg pointer-events-none">
              {selectedGroupId ? "Click to place count markers" : "Select a takeoff layer first"}
            </div>
          )}
          {mode === "measure" && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <div className="bg-teal-900/90 text-teal-200 text-xs px-4 py-2 rounded-lg pointer-events-none">
                {!measureAnchor
                  ? <>Click start · <span className="opacity-70">Shift</span> = snap 45°{measurements.length > 0 ? ` · ${measurements.length} ruler${measurements.length !== 1 ? "s" : ""}` : ""}</>
                  : <>Click end · <span className="opacity-70">Shift</span> = snap 0/45/90/135…</>
                }
              </div>
              {measurements.length > 0 && (
                <button onClick={() => { setMeasurements([]); setSelectedMeasurementIds(new Set()); }}
                  className="bg-teal-700 hover:bg-teal-600 text-white text-xs px-3 py-2 rounded-lg transition">
                  Clear ({measurements.length})
                </button>
              )}
            </div>
          )}
          {mode === "calibrate" && calibStep === "draw" && calibLine === null && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-orange-900/90 text-orange-200 text-xs px-4 py-2 rounded-lg pointer-events-none">
              Click first point, then click second point (hold Shift to snap to 0°/45°/90°)
            </div>
          )}
          {mode === "zone" && !showZonePanel && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-900/90 text-green-200 text-xs px-4 py-2 rounded-lg pointer-events-none">
              Drag to draw a scale zone rectangle
            </div>
          )}

          {/* Select-mode: single item selected → show action buttons */}
          {mode === "select" && selectedItemIds.size === 1 && (() => {
            const item = takeoffItems.find(i => i.id === Array.from(selectedItemIds)[0]);
            if (!item) return null;
            const grp = takeoffGroups.find(g => g.id === item.groupId);
            const canExplode =
              item.shapeType === "POLYLINE" &&
              item.toolData.points.length >= 3 &&
              grp?.type !== "AREA" &&
              grp?.type !== "VOLUME";
            return (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                <button
                  onClick={() => setDetailItem(item)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-200 text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5"
                >
                  ✎ Edit details
                </button>
                {canExplode && (
                  <button
                    onClick={() => explodePolyline(item)}
                    title={`Break into ${item.toolData.points.length - 1} segments — each becomes an independent takeoff line`}
                    className="bg-amber-700 hover:bg-amber-600 border border-amber-500 text-white text-xs px-3 py-2 rounded-lg transition flex items-center gap-1.5"
                  >
                    ⚡ Explode ({item.toolData.points.length - 1} segments)
                  </button>
                )}
              </div>
            );
          })()}

          {/* Markup text input overlay */}
          {textInput && (
            <div className="absolute z-50 pointer-events-auto"
              style={{ left: textInput.imgX * scale + stagePos.x, top: textInput.imgY * scale + stagePos.y }}>
              <input
                autoFocus
                value={textInput.value}
                onChange={e => setTextInput(prev => prev ? { ...prev, value: e.target.value } : null)}
                onBlur={saveTextAnnotation}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); saveTextAnnotation(); }
                  if (e.key === "Escape") { e.stopPropagation(); setTextInput(null); }
                }}
                placeholder="Type here…"
                className="bg-transparent border-b border-dashed outline-none min-w-[80px]"
                style={{ color: markupColor, fontSize: `${14 * scale}px`, borderColor: markupColor }}
              />
            </div>
          )}

          {/* Per-item detail panel */}
          {detailItem && (
            <TakeoffItemDetail
              item={detailItem}
              projectId={projectId}
              drawingId={drawing.id}
              pageId={currentPage.id}
              onClose={() => setDetailItem(null)}
              onUpdated={(updated) => {
                setTakeoffItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
                setDetailItem(updated);
              }}
            />
          )}
        </div>

        {/* ── Estimate tab bar (bottom) ── */}
        <EstimateTabBar
          projectId={projectId}
          disciplines={disciplines}
          activeDisciplineId={activeDisciplineId}
          disciplineTotals={disciplineTotals}
          onSwitch={(id) => {
            setActiveDisciplineId(id);
            localStorage.setItem(`active-discipline-${projectId}`, id);
            setSelectedGroupId(null);
          }}
          onCreated={(d) => { setDisciplines(prev => [...prev, d]); refreshDisciplineTotals(); }}
          onGroupsRefreshNeeded={refreshGroups}
          onUpdated={(d) => setDisciplines(prev => prev.map(x =>
            x.id === d.id
              ? { ...x, ...d }
              : d.isPrimary ? { ...x, isPrimary: false } : x
          ))}
          onDeleted={(id) => {
            setDisciplines(prev => prev.filter(x => x.id !== id));
            setDisciplineTotals(prev => { const n = { ...prev }; delete n[id]; return n; });
            refreshAllPageTotals();
            if (activeDisciplineId === id) {
              const remaining = disciplines.filter(x => x.id !== id);
              setActiveDisciplineId(remaining[0]?.id ?? null);
            }
          }}
        />
      </div>
    </div>
  );
}
