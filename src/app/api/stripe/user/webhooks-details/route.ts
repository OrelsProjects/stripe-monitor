import prisma from "@/app/api/_db/db";
import { authOptions } from "@/auth/authOptions";
import loggerServer from "@/loggerServer";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const userWebhookEvents = await prisma.userWebhookEvent.findMany({
      where: {
        userId: session.user.userId,
      },
    });

    return NextResponse.json(userWebhookEvents, { status: 200 });
  } catch (error: any) {
    loggerServer.error(
      "Error getting webhook details",
      session?.user?.userId || "Unknown user",
      error,
    );
  }
}
