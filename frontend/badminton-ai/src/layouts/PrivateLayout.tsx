import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export type PrivateLayoutContext = {
  onUploadClick: () => void;
  uploadTrigger: number;
};

export default function PrivateLayout() {
  const [uploadTrigger, setUploadTrigger] = useState(0);

  const handleUploadClick = () => {
    setUploadTrigger((prev) => prev + 1);
  };

  return (
    <div className="flex bg-background text-foreground min-h-screen">
      <Sidebar onUploadClick={handleUploadClick} />
      <div className="flex-1 min-w-0">
        <Outlet
          context={{
            onUploadClick: handleUploadClick,
            uploadTrigger,
          }}
        />
      </div>
    </div>
  );
}
