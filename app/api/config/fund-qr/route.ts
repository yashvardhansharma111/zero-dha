import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

type FundPaymentMeta = {
  upiId?: string | null;
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
};

export async function GET() {
  try {
    const db = await getDb();
    const settings = db.collection("settings");

    const imgDoc = await settings.findOne<{ value?: { data?: unknown }; updatedAt?: Date }>({
      key: "fund_qr_image",
    });
    const metaDoc = await settings.findOne<{ value?: FundPaymentMeta }>({
      key: "fund_payment_meta",
    });

    if (imgDoc?.value?.data) {
      const v = imgDoc.updatedAt?.getTime() ?? Date.now();
      return NextResponse.json({
        qrUrl: `/api/config/fund-qr-image?v=${v}`,
        paymentMeta: metaDoc?.value || null,
      });
    }

    const doc = await settings.findOne<{ value?: string }>({
      key: "fund_qr_url",
    });

    return NextResponse.json({
      qrUrl: doc?.value || null,
      paymentMeta: metaDoc?.value || null,
    });
  } catch (error) {
    console.error("Config fund QR error:", error);
    return NextResponse.json(
      { message: "Failed to load config" },
      { status: 500 },
    );
  }
}
