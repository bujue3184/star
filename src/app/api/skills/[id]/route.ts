import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/skills/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const skill = await prisma.skill.findUnique({ where: { id } });

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json({ ...skill, tags: JSON.parse(skill.tags) });
}

// PUT /api/skills/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const skill = await prisma.skill.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      type: body.type,
      content: body.content,
      author: body.author,
      version: body.version,
      preview: body.preview,
      tags: body.tags ? JSON.stringify(body.tags) : undefined,
      isPublic: body.isPublic,
    },
  });

  return NextResponse.json({ ...skill, tags: JSON.parse(skill.tags) });
}

// DELETE /api/skills/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.skill.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
