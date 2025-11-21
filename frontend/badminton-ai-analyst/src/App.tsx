// import { useState } from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
// import './App.css'

// function App() {
//   const [count, setCount] = useState(0)

//   return (
//     <>
//       <div>
//         <a href="https://vite.dev" target="_blank">
//           <img src={viteLogo} className="logo" alt="Vite logo" />
//         </a>
//         <a href="https://react.dev" target="_blank">
//           <img src={reactLogo} className="logo react" alt="React logo" />
//         </a>
//       </div>
//       <h1>Vite + React</h1>
//       <div className="card">
//         <button onClick={() => setCount((count) => count + 1)}>
//           count is {count}
//         </button>
//         <p>
//           Edit <code>src/App.tsx</code> and save to test HMR
//         </p>
//       </div>
//       <p className="read-the-docs">
//         Click on the Vite and React logos to learn more
//       </p>
//     </>
//   )
// }

import React from "react";
import { UploadSection } from "./components/UploadSection";

export default function App() {
    return (
        <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center">
            {/* HEADER */}
            <header className="w-full py-6 border-b border-neutral-800">
                <h1 className="text-center text-3xl font-bold tracking-wide">
                    Badminton AI Analyst
                </h1>
            </header>

            {/* MAIN CONTENT */}
            <main className="w-full flex justify-center px-4">
                <UploadSection />
            </main>
        </div>
    );
}
