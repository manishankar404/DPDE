import { useEffect, useRef, useState } from "react";
import * as nifti from "nifti-reader-js";

function getTypedArray(datatype, buffer) {
  switch (datatype) {
    case nifti.NIFTI1.TYPE_UINT8:
      return new Uint8Array(buffer);
    case nifti.NIFTI1.TYPE_INT16:
      return new Int16Array(buffer);
    case nifti.NIFTI1.TYPE_INT32:
      return new Int32Array(buffer);
    case nifti.NIFTI1.TYPE_FLOAT32:
      return new Float32Array(buffer);
    case nifti.NIFTI1.TYPE_FLOAT64:
      return new Float64Array(buffer);
    default:
      return new Uint8Array(buffer);
  }
}

export default function NiftiViewer({ url }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let aborted = false;

    async function render() {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        let data = arrayBuffer;

        if (nifti.isCompressed(data)) {
          data = nifti.decompress(data);
        }
        if (!nifti.isNIFTI(data)) {
          throw new Error("Not a valid NIfTI file.");
        }

        const header = nifti.readHeader(data);
        const imageBuffer = nifti.readImage(header, data);
        const image = getTypedArray(header.datatypeCode, imageBuffer);
        const dims = header.dims; // [nDim, x, y, z, ...]
        const width = dims[1];
        const height = dims[2];
        const depth = Math.max(dims[3] || 1, 1);
        const sliceIndex = Math.floor(depth / 2);

        const canvas = canvasRef.current;
        if (!canvas || aborted) return;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const imageData = ctx.createImageData(width, height);
        const sliceOffset = sliceIndex * width * height;

        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < width * height; i += 1) {
          const value = image[sliceOffset + i];
          if (value < min) min = value;
          if (value > max) max = value;
        }
        const range = max - min || 1;

        for (let i = 0; i < width * height; i += 1) {
          const value = image[sliceOffset + i];
          const normalized = Math.floor(((value - min) / range) * 255);
          const idx = i * 4;
          imageData.data[idx] = normalized;
          imageData.data[idx + 1] = normalized;
          imageData.data[idx + 2] = normalized;
          imageData.data[idx + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
      } catch (err) {
        if (!aborted) {
          setError(err?.message || "Failed to render NIfTI file.");
        }
      }
    }

    render();

    return () => {
      aborted = true;
    };
  }, [url]);

  if (error) {
    return <p className="text-sm text-amber-700">{error}</p>;
  }

  return <canvas ref={canvasRef} className="h-[70vh] w-full rounded-xl border border-slate-200" />;
}
