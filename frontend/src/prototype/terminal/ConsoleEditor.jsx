import React, {useEffect, useRef, useState} from 'react';

// Attempts to load @monaco-editor/react dynamically; falls back to textarea when unavailable
export default function ConsoleEditor({value, language='sql', onChange}){
  const EditorRef = useRef(null);
  const [monacoAvailable, setMonacoAvailable] = useState(false);

  useEffect(()=>{
    let cancelled = false;
    (async ()=>{
      try{
        const mod = await import('@monaco-editor/react');
        if(cancelled) return;
        EditorRef.current = mod.default;
        setMonacoAvailable(true);
      }catch(e){
        setMonacoAvailable(false);
      }
    })();
    return ()=>{ cancelled = true };
  },[]);

  if(monacoAvailable && EditorRef.current){
    const Monaco = EditorRef.current;
    return (
      <div style={{height:'100%'}}>
        <Monaco
          height="100%"
          defaultLanguage={language}
          theme="vs-dark"
          value={value}
          onChange={onChange}
          options={{automaticLayout:true,minimap:{enabled:false},scrollBeyondLastLine:false}}
        />
      </div>
    );
  }

  return (
    <textarea className="cmd-input" style={{width:'100%',height:'100%',resize:'none',fontFamily:'ui-monospace,Menlo,monospace'}} value={value} onChange={e=>onChange?.(e.target.value)} />
  );
}
