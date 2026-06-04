import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Platform assembly templates — real DUDBC-standard structures
const PLATFORM_ASSEMBLIES = [
  {
    name: "RCC Residential",
    description: "Standard reinforced concrete residential building — 2 to 4 storey. Covers all major work items per DUDBC norms.",
    category: "Structural",
    groups: [
      {
        name: "Earthwork",
        colour: "#92400E",
        children: [
          { name: "Site Clearing & Grubbing", type: "AREA", colour: "#92400E", rateCode: "1.1" },
          { name: "Excavation in Soil", type: "VOLUME", colour: "#78350F", rateCode: "1.2" },
          { name: "Excavation in Hard Rock", type: "VOLUME", colour: "#7C2D12", rateCode: "1.3" },
          { name: "Backfilling & Compaction", type: "VOLUME", colour: "#92400E", rateCode: "1.5" },
        ],
      },
      {
        name: "Foundation",
        colour: "#1E3A5F",
        children: [
          { name: "PCC (1:3:6)", type: "VOLUME", colour: "#1E3A5F", rateCode: "4.1" },
          { name: "RCC Foundation (M20)", type: "VOLUME", colour: "#1E40AF", rateCode: "4.5" },
          { name: "Damp Proof Course (DPC)", type: "AREA", colour: "#2563EB", rateCode: "5.3" },
          { name: "Stone Masonry Footing", type: "VOLUME", colour: "#1D4ED8", rateCode: "3.2" },
        ],
      },
      {
        name: "Superstructure — RCC",
        colour: "#065F46",
        children: [
          { name: "RCC Columns (M20)", type: "VOLUME", colour: "#065F46", rateCode: "4.6" },
          { name: "RCC Beams (M20)", type: "VOLUME", colour: "#047857", rateCode: "4.7" },
          { name: "RCC Slab (M20)", type: "AREA", colour: "#059669", rateCode: "4.8" },
          { name: "RCC Staircase", type: "VOLUME", colour: "#10B981", rateCode: "4.9" },
        ],
      },
      {
        name: "Masonry",
        colour: "#B45309",
        children: [
          { name: "Brick Masonry (1:4) — 9 inch", type: "VOLUME", colour: "#B45309", rateCode: "3.5" },
          { name: "Brick Masonry (1:4) — 4.5 inch", type: "VOLUME", colour: "#D97706", rateCode: "3.6" },
          { name: "Stone Masonry (1:4)", type: "VOLUME", colour: "#92400E", rateCode: "3.3" },
        ],
      },
      {
        name: "Plastering & Finishing",
        colour: "#7C3AED",
        children: [
          { name: "Internal Plaster (1:4) 12mm", type: "AREA", colour: "#7C3AED", rateCode: "6.1" },
          { name: "External Plaster (1:3) 20mm", type: "AREA", colour: "#6D28D9", rateCode: "6.2" },
          { name: "Ceiling Plaster (1:4)", type: "AREA", colour: "#8B5CF6", rateCode: "6.4" },
          { name: "Neeru Finish", type: "AREA", colour: "#A78BFA", rateCode: "6.7" },
        ],
      },
      {
        name: "Flooring",
        colour: "#0369A1",
        children: [
          { name: "Marble / Granite Flooring", type: "AREA", colour: "#0369A1", rateCode: "7.5" },
          { name: "Vitrified Tile Flooring", type: "AREA", colour: "#0284C7", rateCode: "7.4" },
          { name: "Kota Stone Flooring", type: "AREA", colour: "#0EA5E9", rateCode: "7.3" },
          { name: "IPS Flooring (1:2:4) 75mm", type: "AREA", colour: "#38BDF8", rateCode: "7.1" },
        ],
      },
      {
        name: "Doors, Windows & Ironmongery",
        colour: "#BE185D",
        children: [
          { name: "Wooden Flush Door", type: "COUNT", colour: "#BE185D", rateCode: "8.1" },
          { name: "UPVC Window", type: "AREA", colour: "#DB2777", rateCode: "8.5" },
          { name: "MS Grille / Railing", type: "LINEAR", colour: "#EC4899", rateCode: "10.3" },
        ],
      },
      {
        name: "Roofing",
        colour: "#374151",
        children: [
          { name: "CGI Sheet Roofing (0.5mm)", type: "AREA", colour: "#374151", rateCode: "9.1" },
          { name: "RCC Roof Waterproofing", type: "AREA", colour: "#4B5563", rateCode: "9.5" },
          { name: "Brick Bat Coba Waterproofing", type: "AREA", colour: "#6B7280", rateCode: "9.3" },
        ],
      },
      {
        name: "Painting",
        colour: "#D97706",
        children: [
          { name: "Interior Emulsion Paint (2 coats)", type: "AREA", colour: "#D97706", rateCode: "11.1" },
          { name: "Exterior Weather Coat (2 coats)", type: "AREA", colour: "#F59E0B", rateCode: "11.3" },
          { name: "Wood Primer + Enamel Paint", type: "AREA", colour: "#FCD34D", rateCode: "11.6" },
        ],
      },
    ],
  },
  {
    name: "Government Office Building",
    description: "Standard government office complex — single/double storey. Follows DUDBC standard specifications for public buildings.",
    category: "Structural",
    groups: [
      {
        name: "Preliminary Works",
        colour: "#374151",
        children: [
          { name: "Site Clearing & Levelling", type: "AREA", colour: "#374151", rateCode: "1.1" },
          { name: "Hoarding & Barricading", type: "LINEAR", colour: "#4B5563", rateCode: "2.1" },
          { name: "Temporary Site Office", type: "COUNT", colour: "#6B7280", rateCode: "2.3" },
        ],
      },
      {
        name: "Earthwork",
        colour: "#92400E",
        children: [
          { name: "Excavation in Ordinary Soil", type: "VOLUME", colour: "#92400E", rateCode: "1.2" },
          { name: "Excavation in Hard Rock (Blasting)", type: "VOLUME", colour: "#7C2D12", rateCode: "1.4" },
          { name: "Backfilling & Compaction", type: "VOLUME", colour: "#B45309", rateCode: "1.5" },
          { name: "Disposal of Surplus Earth", type: "VOLUME", colour: "#D97706", rateCode: "1.6" },
        ],
      },
      {
        name: "Foundation",
        colour: "#1E3A5F",
        children: [
          { name: "PCC Bed (1:3:6)", type: "VOLUME", colour: "#1E3A5F", rateCode: "4.1" },
          { name: "RCC Foundation (M20)", type: "VOLUME", colour: "#1E40AF", rateCode: "4.5" },
          { name: "RCC Tie Beam", type: "VOLUME", colour: "#2563EB", rateCode: "4.7" },
          { name: "DPC (1:2:4) 50mm", type: "AREA", colour: "#3B82F6", rateCode: "5.3" },
        ],
      },
      {
        name: "Superstructure",
        colour: "#065F46",
        children: [
          { name: "RCC Columns (M20)", type: "VOLUME", colour: "#065F46", rateCode: "4.6" },
          { name: "RCC Beams (M20)", type: "VOLUME", colour: "#047857", rateCode: "4.7" },
          { name: "RCC Slab (M20) — 125mm", type: "AREA", colour: "#059669", rateCode: "4.8" },
          { name: "Brick Masonry Wall (1:4) — 9 inch", type: "VOLUME", colour: "#10B981", rateCode: "3.5" },
          { name: "Partition Wall — 4.5 inch", type: "VOLUME", colour: "#34D399", rateCode: "3.6" },
        ],
      },
      {
        name: "Finishing Works",
        colour: "#7C3AED",
        children: [
          { name: "Internal Plaster (1:4)", type: "AREA", colour: "#7C3AED", rateCode: "6.1" },
          { name: "External Plaster (1:3)", type: "AREA", colour: "#6D28D9", rateCode: "6.2" },
          { name: "IPS Flooring 75mm", type: "AREA", colour: "#8B5CF6", rateCode: "7.1" },
          { name: "Vitrified Tile (Office Areas)", type: "AREA", colour: "#A78BFA", rateCode: "7.4" },
          { name: "Dado Tile (Toilets)", type: "AREA", colour: "#C4B5FD", rateCode: "7.6" },
        ],
      },
      {
        name: "Compound Wall & External Works",
        colour: "#0369A1",
        children: [
          { name: "Compound Wall (Stone Masonry)", type: "LINEAR", colour: "#0369A1", rateCode: "3.3" },
          { name: "Gate (MS Fabricated)", type: "COUNT", colour: "#0284C7", rateCode: "10.5" },
          { name: "Paving Block (Driveway)", type: "AREA", colour: "#0EA5E9", rateCode: "7.8" },
          { name: "Drain (RCC U-type)", type: "LINEAR", colour: "#38BDF8", rateCode: "13.4" },
        ],
      },
      {
        name: "Painting & Final Finishes",
        colour: "#D97706",
        children: [
          { name: "Interior Emulsion Paint", type: "AREA", colour: "#D97706", rateCode: "11.1" },
          { name: "Exterior Texture Paint", type: "AREA", colour: "#F59E0B", rateCode: "11.4" },
          { name: "Floor Polishing / Epoxy Coat", type: "AREA", colour: "#FCD34D", rateCode: "11.9" },
        ],
      },
    ],
  },
  {
    name: "Rural Road Construction",
    description: "Gravel/bituminous rural road. Covers earthwork, sub-base, base course, wearing course, drainage and road furniture per DOLIDAR/DUDBC norms.",
    category: "Road",
    groups: [
      {
        name: "Preliminary & Mobilisation",
        colour: "#374151",
        children: [
          { name: "Mobilisation & Demobilisation", type: "COUNT", colour: "#374151", rateCode: "2.1" },
          { name: "Setting Out / Survey", type: "LINEAR", colour: "#4B5563", rateCode: "2.2" },
          { name: "Tree Felling & Clearing", type: "AREA", colour: "#6B7280", rateCode: "1.1" },
        ],
      },
      {
        name: "Earthwork",
        colour: "#92400E",
        children: [
          { name: "Formation Cutting (Soil)", type: "VOLUME", colour: "#92400E", rateCode: "1.2" },
          { name: "Formation Cutting (Hard Rock)", type: "VOLUME", colour: "#7C2D12", rateCode: "1.4" },
          { name: "Embankment Construction", type: "VOLUME", colour: "#B45309", rateCode: "1.5" },
          { name: "Slope Protection (Bio-engineering)", type: "AREA", colour: "#D97706", rateCode: "1.8" },
        ],
      },
      {
        name: "Sub-base & Base Course",
        colour: "#1E3A5F",
        children: [
          { name: "Sub-base (Granular) — 200mm", type: "AREA", colour: "#1E3A5F", rateCode: "15.1" },
          { name: "Base Course (Gravel) — 150mm", type: "AREA", colour: "#1E40AF", rateCode: "15.2" },
          { name: "WBM Base (Stone Metal) — 100mm", type: "AREA", colour: "#2563EB", rateCode: "15.3" },
        ],
      },
      {
        name: "Wearing Course",
        colour: "#065F46",
        children: [
          { name: "Gravel Surface Dressing — 50mm", type: "AREA", colour: "#065F46", rateCode: "15.5" },
          { name: "Premix Bituminous Carpet — 20mm", type: "AREA", colour: "#047857", rateCode: "16.2" },
          { name: "Seal Coat (Bituminous)", type: "AREA", colour: "#059669", rateCode: "16.3" },
        ],
      },
      {
        name: "Drainage Works",
        colour: "#0369A1",
        children: [
          { name: "Side Drain (Earthen, V-type)", type: "LINEAR", colour: "#0369A1", rateCode: "13.1" },
          { name: "Side Drain (Stone Masonry Lined)", type: "LINEAR", colour: "#0284C7", rateCode: "13.3" },
          { name: "RCC Culvert (Hume Pipe 600mm)", type: "LINEAR", colour: "#0EA5E9", rateCode: "13.6" },
          { name: "Catch Drain / Cut-off Drain", type: "LINEAR", colour: "#38BDF8", rateCode: "13.2" },
        ],
      },
      {
        name: "Structures",
        colour: "#7C3AED",
        children: [
          { name: "RCC Retaining Wall (M15)", type: "VOLUME", colour: "#7C3AED", rateCode: "4.4" },
          { name: "Stone Masonry Retaining Wall", type: "VOLUME", colour: "#6D28D9", rateCode: "3.2" },
          { name: "RCC Bridge Deck (M25)", type: "VOLUME", colour: "#8B5CF6", rateCode: "4.10" },
        ],
      },
      {
        name: "Road Furniture",
        colour: "#BE185D",
        children: [
          { name: "Road Marking (Thermoplastic)", type: "LINEAR", colour: "#BE185D", rateCode: "17.1" },
          { name: "Milestone / Chainage Post", type: "COUNT", colour: "#DB2777", rateCode: "17.3" },
          { name: "Warning Signboard", type: "COUNT", colour: "#EC4899", rateCode: "17.5" },
          { name: "Safety Railing (MS Pipe)", type: "LINEAR", colour: "#F9A8D4", rateCode: "10.3" },
        ],
      },
    ],
  },
  {
    name: "Irrigation Canal System",
    description: "Farmer-managed irrigation system — headworks, main canal, distribution network and field channels. Per DOLIDAR/DUDBC Irrigation norms.",
    category: "Irrigation",
    groups: [
      {
        name: "Headworks",
        colour: "#1E3A5F",
        children: [
          { name: "Weir / Barrage (Stone Masonry)", type: "VOLUME", colour: "#1E3A5F", rateCode: "3.2" },
          { name: "RCC Intake Structure", type: "VOLUME", colour: "#1E40AF", rateCode: "4.5" },
          { name: "Trash Rack (MS Fabricated)", type: "COUNT", colour: "#2563EB", rateCode: "10.6" },
          { name: "Head Regulator (RCC)", type: "COUNT", colour: "#3B82F6", rateCode: "4.6" },
        ],
      },
      {
        name: "Main Canal Earthwork",
        colour: "#92400E",
        children: [
          { name: "Canal Excavation (Ordinary Soil)", type: "VOLUME", colour: "#92400E", rateCode: "1.2" },
          { name: "Canal Excavation (Hard Rock)", type: "VOLUME", colour: "#7C2D12", rateCode: "1.4" },
          { name: "Embankment Formation", type: "VOLUME", colour: "#B45309", rateCode: "1.5" },
        ],
      },
      {
        name: "Canal Lining",
        colour: "#065F46",
        children: [
          { name: "Concrete Lining (M15) — 75mm", type: "AREA", colour: "#065F46", rateCode: "4.3" },
          { name: "Stone Masonry Lining (1:4)", type: "AREA", colour: "#047857", rateCode: "3.4" },
          { name: "HDPE Geomembrane Lining", type: "AREA", colour: "#059669", rateCode: "20.1" },
        ],
      },
      {
        name: "Canal Structures",
        colour: "#7C3AED",
        children: [
          { name: "Cross Regulator (RCC)", type: "COUNT", colour: "#7C3AED", rateCode: "4.7" },
          { name: "Drop Structure (RCC)", type: "COUNT", colour: "#6D28D9", rateCode: "4.8" },
          { name: "Division Box (RCC)", type: "COUNT", colour: "#8B5CF6", rateCode: "4.9" },
          { name: "Flume (RCC)", type: "LINEAR", colour: "#A78BFA", rateCode: "4.10" },
          { name: "Syphon / Inverted Syphon", type: "LINEAR", colour: "#C4B5FD", rateCode: "13.7" },
        ],
      },
      {
        name: "Cross Drainage",
        colour: "#0369A1",
        children: [
          { name: "Aqueduct (RCC)", type: "COUNT", colour: "#0369A1", rateCode: "13.8" },
          { name: "Culvert (Hume Pipe 450mm)", type: "LINEAR", colour: "#0284C7", rateCode: "13.6" },
          { name: "Level Crossing", type: "COUNT", colour: "#0EA5E9", rateCode: "13.9" },
        ],
      },
      {
        name: "Distribution Network",
        colour: "#D97706",
        children: [
          { name: "Secondary Canal Excavation", type: "VOLUME", colour: "#D97706", rateCode: "1.2" },
          { name: "Secondary Canal Lining (Concrete)", type: "AREA", colour: "#F59E0B", rateCode: "4.3" },
          { name: "Tertiary / Field Channel Excavation", type: "VOLUME", colour: "#FCD34D", rateCode: "1.2" },
          { name: "Field Channel Lining", type: "AREA", colour: "#FDE68A", rateCode: "3.4" },
        ],
      },
      {
        name: "Miscellaneous",
        colour: "#374151",
        children: [
          { name: "Gabion Wall / Toe Protection", type: "VOLUME", colour: "#374151", rateCode: "20.5" },
          { name: "Bio-engineering (Grass Turf)", type: "AREA", colour: "#4B5563", rateCode: "1.8" },
          { name: "Farmer Access Path", type: "LINEAR", colour: "#6B7280", rateCode: "15.1" },
        ],
      },
    ],
  },
];

async function seedPlatformAssemblies() {
  const existing = await prisma.assembly.count({ where: { orgId: null, isPublic: true } });
  if (existing > 0) {
    console.log("Platform assemblies already seeded, skipping.");
    return;
  }

  for (const template of PLATFORM_ASSEMBLIES) {
    const assembly = await prisma.assembly.create({
      data: {
        name: template.name,
        description: template.description,
        category: template.category,
        orgId: null,
        isPublic: true,
        createdById: null,
      },
    });

    for (let gi = 0; gi < template.groups.length; gi++) {
      const grp = template.groups[gi];
      const parent = await prisma.assemblyGroup.create({
        data: {
          assemblyId: assembly.id,
          parentId: null,
          name: grp.name,
          type: "LINEAR",
          colour: grp.colour,
          sortOrder: gi,
        },
      });

      for (let ci = 0; ci < grp.children.length; ci++) {
        const child = grp.children[ci];
        await prisma.assemblyGroup.create({
          data: {
            assemblyId: assembly.id,
            parentId: parent.id,
            name: child.name,
            type: child.type as any,
            colour: child.colour,
            rateCode: child.rateCode,
            sortOrder: ci,
          },
        });
      }
    }

    console.log(`Seeded platform assembly: ${template.name}`);
  }
}

async function main() {
  // Super admin
  const email = "admin@nepaliestimate.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await bcrypt.hash("Admin@1234", 12);
    await prisma.user.create({
      data: {
        name: "Super Admin",
        email,
        passwordHash,
        emailVerified: true,
        isSuperAdmin: true,
        role: "OWNER",
      },
    });
    console.log("Super admin seeded:", email, "/ Admin@1234");
  } else {
    console.log("Super admin already exists:", email);
  }

  // Platform assembly templates
  await seedPlatformAssemblies();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
