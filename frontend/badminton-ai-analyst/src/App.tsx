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

import { useState } from "react";

function App() {
    const [result, setResult] = useState(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;

        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("http://localhost:8000/analyze-video", {
            method: "POST",
            body: formData,
        });

        const data = await res.json();
        setResult(data);
    };

    return (
        <div style={{ padding: 50 }}>
            <h1>Badminton AI Analyst</h1>

            <input type="file" accept="video/*" onChange={handleUpload} />

            {result && (
                <pre style={{ marginTop: 20 }}>
                    {JSON.stringify(result, null, 2)}
                </pre>
            )}
        </div>
    );
}

export default App;
