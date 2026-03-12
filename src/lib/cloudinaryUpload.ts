const CLOUDINARY_CLOUD_NAME = "ddx2gnklt";
const CLOUDINARY_UPLOAD_PRESET = "videos booked jobs";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  format: string;
  duration: number;
}

export const uploadVideoToCloudinary = (
  file: File,
  onProgress?: (percent: number) => void
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", CLOUDINARY_UPLOAD_URL);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.send(formData);
  });
};

/**
 * Transform a Cloudinary video URL to ensure cross-browser MP4 playback.
 */
export const getCloudinaryVideoUrl = (url: string): string => {
  if (!url.includes("cloudinary.com")) return url;
  // Insert f_mp4/q_auto transformation before /upload/ path
  return url.replace("/upload/", "/upload/f_mp4,q_auto/");
};
