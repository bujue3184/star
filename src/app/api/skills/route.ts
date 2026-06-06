/**
 * Skill CRUD API
 *
 * GET    /api/skills       - 获取所有 Skill（支持 ?type=ROLE_PLAY 过滤）
 * POST   /api/skills       - 创建新 Skill
 * PUT    /api/skills/:id   - 更新 Skill
 * DELETE /api/skills/:id   - 删除 Skill
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/skills
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  const where = type ? { type } : {};

  const skills = await prisma.skill.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  // 解析 tags JSON 字段
  const parsed = skills.map((s) => ({
    ...s,
    tags: JSON.parse(s.tags),
  }));

  return NextResponse.json(parsed);
}

// POST /api/skills
export async function POST(request: NextRequest) {
  const body = await request.json();

  const skill = await prisma.skill.create({
    data: {
      name: body.name,
      description: body.description || null,
      type: body.type || "ROLE_PLAY",
      content: body.content,
      author: body.author || null,
      version: body.version || "1.0.0",
      preview: body.preview || null,
      tags: JSON.stringify(body.tags || []),
      isPublic: body.isPublic ?? true,
    },
  });

  return NextResponse.json({ ...skill, tags: JSON.parse(skill.tags) }, { status: 201 });
}
