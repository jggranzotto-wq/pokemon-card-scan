import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isPhotoCancel(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /cancel/i.test(message);
}

export async function pickNativePhoto(source: "camera" | "gallery"): Promise<File | undefined> {
  const photo = await Camera.getPhoto({
    source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    resultType: CameraResultType.DataUrl,
    quality: 90,
    correctOrientation: true,
    width: 1600,
  });
  if (!photo.dataUrl) return undefined;
  const res = await fetch(photo.dataUrl);
  const blob = await res.blob();
  const ext = photo.format || "jpeg";
  return new File([blob], `card.${ext}`, { type: blob.type || `image/${ext}` });
}
