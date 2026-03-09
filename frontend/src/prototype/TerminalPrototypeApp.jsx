import React, {useState, useEffect, useRef} from 'react';
import './terminal/terminal.css';
import ConsoleEditor from './terminal/ConsoleEditor';
import { startMockConversion } from './terminal/MockBackend';

export default function TerminalPrototypeApp(){
  const [activeStep,setActiveStep] = useState(3); // Conversion
  const [cmd, setCmd] = useState('convert sp_UpdateInventory');
  const [converted, setConverted] = useState('-- converted sql will appear here');
  const [logs, setLogs] = useState([]);
  const convRef = useRef(null);

  useEffect(()=>{return ()=>{convRef.current?.close?.();}},[]);

  function appendLog(l){ setLogs(prev=>[l,...prev]); }

  const runMock = ()=>{
    setLogs([]);
    setConverted('-- converting...');
    const backend = startMockConversion({id:'sp_UpdateInventory', sourceSql:'...' });
    convRef.current = backend;
    backend.onLog((entry)=>{
      // entry: { timestamp, level, message } or when level==='done' the entry is the result object
      if(entry.level === 'done'){
        const res = entry; // MockBackend emits the result object as the second argument; here we receive it via emit
        // If the mock used emit('done', result) we may receive { level:'done', message:..., result }
        // Support both shapes:
        const payload = entry.result || (entry.payload) || entry;
        if(payload && payload.convertedSql){
          setConverted(payload.convertedSql);
        } else if(payload && payload.convertedSQL){
          setConverted(payload.convertedSQL);
        }
        appendLog({timestamp:new Date().toLocaleTimeString([], {hour12:false}), level:'success', message:'Conversion finished — confidence 87%'});
        return;
      }
      appendLog(entry);
    });
  };

  return (
    <div className="term-app">
      <aside className="term-sidebar">
        <div className="term-card">
          <div style={{fontWeight:800,fontSize:14}}>procly (Console)</div>
          <div style={{fontSize:12,color:'var(--muted-text)'}}>Terminal-first ops flow</div>
        </div>

        <div className="term-card term-steps">
          {[ 'Connection','Schema Scan','Object Selection','Conversion','Review','Deploy'].map((s,i)=> (
            <div key={s} className={"term-step "+(i===activeStep? 'active':'')} onClick={()=>setActiveStep(i)}>
              <div>{s}</div>
              <div style={{fontSize:12,color:'var(--muted-text)'}}>{i===3? 'active':''}</div>
            </div>
          ))}
        </div>

        <div className="term-card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:700}}>Deploy</div>
            <div style={{fontSize:12,color:'var(--muted-text)'}}>Dry-run</div>
          </div>
          <div style={{marginTop:8,display:'flex',gap:8}}>
            <button className="btn" onClick={()=>appendLog({timestamp:new Date().toLocaleTimeString([], {hour12:false}), level:'info', message:'Triggered dry-run'})}>Dry-run</button>
            <button className="btn primary" onClick={()=>appendLog({timestamp:new Date().toLocaleTimeString([], {hour12:false}), level:'info', message:'Deploy started (mock)'})}>Deploy</button>
          </div>
        </div>
      </aside>

      <main className="term-main">
        <div className="term-topbar">
          <input className="cmd-input" value={cmd} onChange={e=>setCmd(e.target.value)} />
          <button className="btn primary" onClick={runMock}>Run</button>
        </div>

        <div className="term-content">
          <div className="editor-pane">
            <div className="editor-header">
              <div style={{fontWeight:700}}>Converted (editable)</div>
              <div style={{display:'flex',gap:8}}>
                <div className="btn">Format</div>
                <div className="btn">Export</div>
              </div>
            </div>
            <div className="editor-body">
              <ConsoleEditor value={converted} onChange={setConverted} language={'sql'} />
            </div>
          </div>

          <div className="diff-pane">
            <div className="diff-header">
              <div style={{fontWeight:700}}>Diff (Original → Converted)</div>
              <div style={{fontSize:12,color:'var(--muted-text)'}}>Confidence: 87%</div>
            </div>
            <div className="diff-body">
              <div style={{fontWeight:700,marginBottom:6}}>Original T-SQL</div>
              <pre style={{whiteSpace:'pre-wrap',marginBottom:12}}>{`UPDATE Inventory SET Qty = Qty - 1 WHERE Id = @id;\nIF @@ROWCOUNT = 0\n  RAISERROR('Not found',16,1);`}</pre>
              <div style={{fontWeight:700,marginBottom:6}}>Converted PL/pgSQL</div>
              <pre style={{whiteSpace:'pre-wrap'}}>{converted}</pre>
            </div>
          </div>
        </div>

        <div className="logs">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{fontWeight:700}}>Logs & AI Reasoning</div>
            <div style={{fontSize:12,color:'var(--muted-text)'}}>Streaming (mock)</div>
          </div>
          {logs.length===0 && <div style={{color:'var(--muted-text)'}}>No logs yet.</div>}
          {logs.map((l,idx)=> (
            <div key={idx} className={`log-line log-${l.level||'info'}`}>
              <div style={{fontSize:12,color:'var(--muted-text)'}}>{l.timestamp}</div>
              <div style={{marginTop:6}}>{l.message}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
