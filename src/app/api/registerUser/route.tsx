import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/api/_db/db";

type Body = {
  interestedUser: string;
};

export async function POST(req: NextRequest) {
  try {
    const { interestedUser }: Body = await req.json();

    const existingUser = await prisma.interestedUser.findFirst({
      where: {
        email: interestedUser,
      },
    });

    if (!existingUser) {
      await prisma.interestedUser.create({
        data: {
          email: interestedUser,
        },
      });
    }

    // if (!existingUser) {
    //   await sendWelcomeMail(interestedUser, false);
    // }

    return NextResponse.json(
      { message: "User registered successfully" },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Error registering user", { error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
