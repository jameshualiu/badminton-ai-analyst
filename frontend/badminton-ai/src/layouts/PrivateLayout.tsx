import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export type PrivateLayoutContext = {
  onUploadClick: () => void;
  activeAnalysisView: string;
  setActiveAnalysisView: (view: string) => void;
};

export default function PrivateLayout() {
  const [uploadTrigger, setUploadTrigger] = useState(0);
  const [activeAnalysisView, setActiveAnalysisView] = useState("overlay");
  const { pathname } = useLocation();

  const handleUploadClick = () => {
    // If we are on dashboard, we can trigger the modal.
    // If we are elsewhere, we might need to navigate first.
    setUploadTrigger(prev => prev + 1);
  };

  return (
    <div className="flex bg-background text-foreground min-h-screen">
      <Sidebar 
        onUploadClick={handleUploadClick}
        activeAnalysisView={activeAnalysisView}
        onAnalysisViewChange={setActiveAnalysisView}
      />
      <div className="flex-1 min-w-0">
        <Outlet context={{ 
          onUploadClick: handleUploadClick, 
          uploadTrigger,
          activeAnalysisView, 
          setActiveAnalysisView 
        }} />
      </div>
    </div>
  );
}
