"use client";
import { cn } from "@/lib/utils";
import { IconUpload } from "@tabler/icons-react";
import { motion } from "framer-motion";
import React, { useId, useRef, useState } from "react";
import { type Accept, useDropzone } from "react-dropzone";
import { useTimeZone } from "@/components/TimeZoneContext";

const mainVariant = {
  initial: { x: 0, y: 0 },
  animate: { x: 20, y: -20, opacity: 0.9 },
};

const secondaryVariant = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

export const FileUpload = ({
  onChange,
  multiple,
  accept,
  resetToken,
}: {
  onChange?: (files: File[]) => void;
  multiple?: boolean;
  accept?: Accept;
  resetToken?: string | number;
}) => {
  const { timeZone } = useTimeZone();
  const [files, setFiles] = useState<File[]>([]);
  const instanceId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (newFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    onChange?.(newFiles);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const { getRootProps, isDragActive } = useDropzone({
    accept,
    multiple,
    maxFiles: multiple ? 10 : 1,
    noClick: true,
    onDrop: handleFileChange,
    onDropRejected: (error) => {
      console.log(error);
    },
  });

  // Reset internal files when parent indicates a clear
  React.useEffect(() => {
    if (resetToken !== undefined) {
      setFiles([]);
    }
  }, [resetToken]);

  return (
    <div className="w-full" {...getRootProps()}>
      <motion.div
        onClick={handleClick}
        whileHover="animate"
        className="p-10 group/file block rounded-lg cursor-pointer w-full relative overflow-hidden"
      >
        <input
          ref={fileInputRef}
          id="file-upload-handle"
          type="file"
          onChange={(e) => handleFileChange(Array.from(e.target.files || []))}
          className="hidden"
          multiple={multiple}
          disabled={!multiple && files.length > 0}
          accept={accept ? Object.values(accept).join(",") : undefined}
        />
        <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]">
          <GridPattern seed={instanceId} />
        </div>
        <div className="flex flex-col items-center justify-center">
          <p className="relative z-20 font-sans font-bold text-foreground text-base">
            Select or drop images
          </p>
          <p className="relative z-20 font-sans font-normal text-muted-foreground text-base mt-2">
            Drag and drop here, or click to choose files
          </p>
          <div className="relative w-full mt-10 max-w-xl mx-auto">
            {files.length > 0 &&
              files.map((file, idx) => (
                <motion.div
                  key={`${instanceId}-${file.name}-${file.lastModified}`}
                  layoutId={idx === 0 ? "file-upload" : `file-upload-${idx}`}
                  className={cn(
                    "relative overflow-hidden z-40 bg-card flex flex-col items-start justify-start md:h-24 p-4 mt-4 w-full mx-auto rounded-md",
                    "shadow-sm"
                  )}
                >
                  <div className="flex justify-between w-full items-center gap-4">
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="text-base text-foreground truncate max-w-xs"
                    >
                      {file.name}
                    </motion.p>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="rounded-lg px-2 py-1 w-fit flex-shrink-0 text-sm text-foreground bg-muted shadow-input"
                    >
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </motion.p>
                  </div>

                  <div className="flex text-sm md:flex-row flex-col items-start md:items-center w-full mt-2 justify-between text-muted-foreground">
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      layout
                      className="px-1 py-0.5 rounded-md bg-muted"
                    >
                      {file.type}
                    </motion.p>

                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} layout>
                      modified{" "}
                      {new Intl.DateTimeFormat("en-CA", {
                        timeZone,
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      }).format(new Date(file.lastModified))}
                    </motion.p>
                  </div>
                </motion.div>
              ))}
            {!files.length && (
              <motion.div
                layoutId="file-upload"
                variants={mainVariant}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={cn(
                  "relative group-hover/file:shadow-2xl z-40 bg-card flex items-center justify-center h-32 mt-4 w-full max-w-[8rem] mx-auto rounded-md",
                  "shadow-[0px_10px_50px_rgba(0,0,0,0.1)]"
                )}
              >
                {isDragActive ? (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground flex flex-col items-center">
                    Drop it
                    <IconUpload className="h-4 w-4 text-muted-foreground" />
                  </motion.p>
                ) : (
                  <IconUpload className="h-4 w-4 text-muted-foreground" />
                )}
              </motion.div>
            )}

            {!files.length && (
              <motion.div
                variants={secondaryVariant}
                className="absolute opacity-0 border border-dashed border-primary/50 inset-0 z-30 bg-transparent flex items-center justify-center h-32 mt-4 w-full max-w-[8rem] mx-auto rounded-md"
              />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export function GridPattern({ seed }: { seed?: string }) {
  const columns = 41;
  const rows = 11;
  return (
    <div className="flex bg-muted flex-shrink-0 flex-wrap justify-center items-center gap-x-px gap-y-px  scale-105">
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: columns }).map((_, col) => {
          const index = row * columns + col;
          const keyVal = `${seed || "grid"}-${row}-${col}`;
          return (
            <div
              key={keyVal}
              className={`w-10 h-10 flex flex-shrink-0 rounded-[2px] ${
                index % 2 === 0
                  ? "bg-background"
                  : "bg-background shadow-[0px_0px_1px_3px_rgba(255,255,255,0.6)_inset]"
              }`}
            />
          );
        })
      )}
    </div>
  );
}
