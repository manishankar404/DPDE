import { useEffect, useRef, useState } from "react";
import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  configured = true;
}

export default function DicomViewer({ url }) {
  const elementRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !url) return () => {};

    ensureConfigured();
    cornerstone.enable(element);
    const imageId = `wadouri:${url}`;

    cornerstone
      .loadImage(imageId)
      .then((image) => {
        cornerstone.displayImage(element, image);
      })
      .catch((err) => {
        setError(err?.message || "Failed to render DICOM image.");
      });

    return () => {
      try {
        cornerstone.disable(element);
      } catch {
        // ignore cleanup errors
      }
    };
  }, [url]);

  if (error) {
    return <p className="text-sm text-amber-700">{error}</p>;
  }

  return <div ref={elementRef} className="h-[70vh] w-full rounded-xl border border-slate-200" />;
}
