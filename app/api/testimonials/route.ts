import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { handleApiError, apiError, unauthorized } from "@/lib/errors";
import { checkApiRateLimit, getClientIp } from "@/lib/security";

const CACHE_KEY = "testimonials:approved";
const CACHE_TTL = 3600; // 1 hour — busted immediately on admin approval

const submitSchema = z.object({
  authorName: z.string().min(2).max(100).trim(),
  authorRole: z.string().max(100).trim().optional(),
  company: z.string().max(100).trim().optional(),
  content: z.string().min(20).max(1000).trim(),
  rating: z.number().int().min(1).max(5).default(5),
});

// Public: returns approved testimonials (Redis-cached for 1 hour)
export async function GET() {
  try {
    const cached = await redis.get(CACHE_KEY).catch(() => null);
    if (cached) return NextResponse.json(JSON.parse(cached));

    const testimonials = await prisma.testimonial.findMany({
      where: { isApproved: true },
      orderBy: { submittedAt: "desc" },
      take: 8,
      select: {
        id: true,
        authorName: true,
        authorRole: true,
        company: true,
        content: true,
        rating: true,
      },
    });

    redis.set(CACHE_KEY, JSON.stringify(testimonials), "EX", CACHE_TTL).catch(() => {});
    return NextResponse.json(testimonials);
  } catch (err) {
    return handleApiError(err);
  }
}

// Authenticated: submit a testimonial for admin review
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await checkApiRateLimit(ip);
    if (limited) return limited;

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) throw unauthorized();

    // One submission per user per day (prevent spam)
    const recentKey = `testimonial_submit:${token.id}`;
    const alreadySubmitted = await redis.get(recentKey).catch(() => null);
    if (alreadySubmitted) {
      return apiError("RATE_LIMITED", "You can only submit one testimonial per day.", 429);
    }

    const body = await req.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid input.", 400, parsed.error.flatten(i => i.message));
    }

    await prisma.testimonial.create({
      data: {
        ...parsed.data,
        userId: token.id as string,
        isApproved: false,
      },
    });

    // Rate-limit one submission per day per user
    redis.set(recentKey, "1", "EX", 86400).catch(() => {});

    return NextResponse.json(
      { message: "Thank you! Your testimonial has been submitted for review." },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
