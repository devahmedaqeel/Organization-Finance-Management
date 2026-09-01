import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { downloadPdf, PdfOperationResult } from "./pdfDownloadService";

export interface CraftMyPdfOptions {
  apiKey?: string;
  templateId: string;
  data: Record<string, any>;
  outputFile?: string;
  expiration?: number; // Minutes before the PDF URL expires
}

export interface CraftMyPdfResponse {
  status: "success" | "error";
  file?: string; // Direct download URL of generated PDF
  message?: string;
  transaction_ref?: string;
  error?: string;
}

const DEFAULT_API_KEY = "7832MjA6MTE6UjlkM3h4emxpTExzeFR0aQ=";
const API_ENDPOINT = "https://api.craftmypdf.com/v1/create";

/**
 * Sends a PDF generation request to CraftMyPDF API.
 * Returns the URL and status of the generated PDF document.
 */
export async function generateCraftMyPdf({
  apiKey = DEFAULT_API_KEY,
  templateId,
  data,
  outputFile = "output.pdf",
  expiration = 15,
}: CraftMyPdfOptions): Promise<CraftMyPdfResponse> {
  try {
    const payload = {
      template_id: templateId,
      export_type: "json",
      expiration,
      output_file: outputFile,
      data: typeof data === "string" ? data : JSON.stringify(data),
    };

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || result.status === "error") {
      throw new Error(result.message || result.error || `CraftMyPDF Error (HTTP ${response.status})`);
    }

    return result as CraftMyPdfResponse;
  } catch (error: any) {
    console.error("[CraftMyPDF] Generation failed:", error);
    throw new Error(error?.message || "CraftMyPDF API request failed.");
  }
}

/**
 * Generates a PDF via CraftMyPDF and downloads it directly to Android / iOS device storage or Web.
 */
export async function generateAndDownloadCraftMyPdf(
  options: CraftMyPdfOptions
): Promise<PdfOperationResult> {
  const result = await generateCraftMyPdf(options);

  if (!result.file) {
    throw new Error("CraftMyPDF response did not return a valid download URL.");
  }

  const filename = options.outputFile || "document.pdf";

  // 1. Web Platform: Trigger browser download from URL
  if (Platform.OS === "web") {
    return downloadPdf({
      sourceUri: result.file,
      filename,
    });
  }

  // 2. Mobile Platform (Android / iOS): Download remote file to local cache, then invoke SAF / system save
  const tempDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
  const localTempUri = `${tempDir}craft_${Date.now()}_${filename}`;

  const downloadRes = await FileSystem.downloadAsync(result.file, localTempUri);

  if (downloadRes.status !== 200) {
    throw new Error(`Failed to download PDF from CraftMyPDF URL (HTTP ${downloadRes.status})`);
  }

  return downloadPdf({
    sourceUri: downloadRes.uri,
    filename,
  });
}
