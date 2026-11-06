export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

export async function fileToBase64Data(file: File): Promise<{ name: string; type: string; base64: string }> {
  const base64 = await fileToBase64(file);
  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    base64
  };
}