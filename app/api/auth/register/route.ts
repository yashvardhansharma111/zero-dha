import { apiErrorResponse } from "@/lib/api-error";
import { getDb } from "@/lib/mongodb";
import { NextResponse } from "next/server";

/** Accept only HTTPS URLs from UploadThing / UFS CDNs (not arbitrary user-supplied hosts). */
function isUploadThingHttpsUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return (
      h === "utfs.io" ||
      h.endsWith(".utfs.io") ||
      h === "ufs.sh" ||
      h.endsWith(".ufs.sh") ||
      h.endsWith(".uploadthing.com") ||
      h.endsWith(".uploadthing.pro")
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fullName = formData.get("fullName")?.toString().trim() ?? "";
    const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
    const phone = formData.get("phone")?.toString().trim() ?? "";
    const panNumber = formData.get("panNumber")?.toString().trim().toUpperCase() ?? "";
    const aadhaarNumber = formData.get("aadhaarNumber")?.toString().trim() ?? "";
    const accountNo = formData.get("accountNo")?.toString().trim() ?? "";
    const ifscCode = formData.get("ifscCode")?.toString().trim().toUpperCase() ?? "";
    const documentType = formData.get("documentType")?.toString().trim() ?? "";

    const photo = formData.get("photo");
    const bankProof = formData.get("bankProof");
    const document = formData.get("document");
    const signatureUrlRaw = formData.get("signatureUrl")?.toString().trim() ?? "";

    if (!fullName || !email || !phone) {
      return NextResponse.json(
        { message: "Full name, email and phone are required" },
        { status: 400 },
      );
    }

    if (!accountNo || !ifscCode) {
      return NextResponse.json(
        { message: "Account details are required" },
        { status: 400 },
      );
    }

    const db = await getDb();
    const users = db.collection("users");

    const existing = await users.findOne({ email });
    if (existing) {
      return NextResponse.json(
        { message: "Email already registered" },
        { status: 400 },
      );
    }

    const documents: Record<
      string,
      { data: Buffer; contentType: string } | null
    > = {
      photo: null,
      signature: null,
      bankProof: null,
      document: null,
    };

    async function fileToDoc(
      fileEntry: FormDataEntryValue | null,
    ): Promise<{ data: Buffer; contentType: string } | null> {
      if (!fileEntry || !(fileEntry instanceof File)) return null;
      const arrayBuffer = await fileEntry.arrayBuffer();
      return {
        data: Buffer.from(arrayBuffer),
        contentType: fileEntry.type || "application/octet-stream",
      };
    }

    documents.photo = await fileToDoc(photo);
    const signatureFile = formData.get("signature");
    documents.signature = await fileToDoc(signatureFile);
    documents.bankProof = await fileToDoc(bankProof);
    documents.document = await fileToDoc(document);

    const signatureUploadThingUrl = isUploadThingHttpsUrl(signatureUrlRaw)
      ? signatureUrlRaw
      : null;

    if (!documents.signature && !signatureUploadThingUrl) {
      return NextResponse.json(
        { message: "Signature image is required" },
        { status: 400 },
      );
    }

    if (signatureUrlRaw && !signatureUploadThingUrl) {
      return NextResponse.json(
        { message: "Invalid signature URL" },
        { status: 400 },
      );
    }

    await users.insertOne({
      fullName,
      email,
      phone,
      panNumber: panNumber || null,
      aadhaarNumber: aadhaarNumber || null,
      bankDetails: {
        accountNo,
        ifscCode,
        documentType,
      },
      status: "pending",
      createdAt: new Date(),
      passwordHash: null,
      tradingBalance: 0,
      margin: 0,
      documents: {
        photo: documents.photo,
        signature: documents.signature,
        bankProof: documents.bankProof,
        document: documents.document,
        signatureUploadThingUrl,
      },
    });

    return NextResponse.json(
      {
        message: "Registration submitted successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(
      error,
      "Registration error:",
      "Something went wrong while registering",
    );
  }
}
