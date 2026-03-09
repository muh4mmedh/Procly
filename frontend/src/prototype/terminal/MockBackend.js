// Simple mock backend to simulate conversion and streaming logs
export function startMockConversion({id='obj-1', sourceSql}){
  let closed = false;
  const listeners = [];

  function onLog(cb){ listeners.push(cb); }
  function emit(type,msg){ const t=new Date().toLocaleTimeString([], {hour12:false}); listeners.forEach(cb=>cb({timestamp:t,level:type,message:msg})); }

  // Simulate timeline
  setTimeout(()=>{ if(closed) return; emit('info','Queued conversion for '+id); }, 300);
  setTimeout(()=>{ if(closed) return; emit('info','Starting analysis (tokenize + AST)'); }, 900);
  setTimeout(()=>{ if(closed) return; emit('info','Detected risky token: RAISERROR'); }, 1600);
  setTimeout(()=>{ if(closed) return; emit('warn','Using fallback for SQL CLR and dynamic SQL'); }, 2600);
  setTimeout(()=>{ if(closed) return; emit('info','Generating PL/pgSQL function'); }, 3500);

  // final result
  const result = {
    convertedSql:`CREATE OR REPLACE FUNCTION migrated() RETURNS void AS $$\nBEGIN\n  -- converted example\n  RAISE EXCEPTION 'Not found';\nEND;\n$$ LANGUAGE plpgsql;`,
    confidence:0.87,
    risks:[{token:'RAISERROR',explanation:'No direct equivalent in PL/pgSQL — use RAISE',severity:'high'}]
  };

  setTimeout(()=>{ if(closed) return; emit('success','Conversion complete — confidence 87%'); emit('done', result); }, 4400);

  return { onLog, close:()=>{closed=true;} };
}
