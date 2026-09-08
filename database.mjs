// Translate only SQL syntax; values always travel as separate PostgreSQL parameters.
export function postgresSQL(sql) {
  let output='',position=0,parameter=0;
  while(position<sql.length){
    const rest=sql.slice(position);
    if(rest.startsWith('--')){const end=sql.indexOf('\n',position);const stop=end<0?sql.length:end+1;output+=sql.slice(position,stop);position=stop;continue;}
    if(rest.startsWith('/*')){
      let end=position+2,depth=1;
      while(end<sql.length&&depth){if(sql.startsWith('/*',end)){depth++;end+=2;}else if(sql.startsWith('*/',end)){depth--;end+=2;}else end++;}
      if(depth)throw new SyntaxError('Unterminated SQL comment');output+=sql.slice(position,end);position=end;continue;
    }
    const dollar=rest.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if(dollar){const end=sql.indexOf(dollar,position+dollar.length);if(end<0)throw new SyntaxError('Unterminated SQL dollar quote');const stop=end+dollar.length;output+=sql.slice(position,stop);position=stop;continue;}
    const quote=sql[position];
    if(quote==="'"||quote==='"'){
      let end=position+1,closed=false;
      const escaped=quote==="'"&&/[eE]/.test(sql[position-1]||'')&&(position<2||!/[\w$]/.test(sql[position-2]));
      while(end<sql.length){if(escaped&&sql[end]==='\\'){end+=2;continue;}if(sql[end]===quote){if(sql[end+1]===quote){end+=2;continue;}end++;closed=true;break;}end++;}
      if(!closed)throw new SyntaxError('Unterminated SQL quote');output+=sql.slice(position,end);position=end;continue;
    }
    const json=rest.match(/^json_each\(\s*\?\s*\)/i);
    if(json){output+=`jsonb_array_elements_text($${++parameter}::jsonb)`;position+=json[0].length;continue;}
    output+=sql[position]==='?'?'$'+(++parameter):sql[position];position++;
  }
  if(/^\s*INSERT OR IGNORE\s/i.test(output))output=output.replace(/^(\s*)INSERT OR IGNORE\s/i,'$1INSERT ').trimEnd().replace(/;$/,'')+' ON CONFLICT DO NOTHING';
  return output;
}
export function createDatabase(pool) {
  const cache=new Map();
  const translate=sql=>{
    if(cache.has(sql))return cache.get(sql);
    const value=postgresSQL(sql);
    if(cache.size>=256)cache.delete(cache.keys().next().value);
    cache.set(sql,value);return value;
  };
  class Statement {
    constructor(sql,values=[]){this.sql=sql;this.values=values;}
    bind(...values){return new Statement(this.sql,values);}
    async first(){return (await pool.query(this.sql,this.values)).rows[0]??null;}
    async all(){return {results:(await pool.query(this.sql,this.values)).rows};}
    async run(){const result=await pool.query(this.sql,this.values);return {success:true,meta:{changes:result.rowCount}};}
  }
  return {
    prepare:sql=>new Statement(translate(sql)),
    async batch(statements){
      if(!statements.every(s=>s instanceof Statement))throw new TypeError('Batch statements must come from this database');
      if(!statements.length)return [];
      const client=await pool.connect();let releaseError;
      try{
        await client.query('BEGIN');const results=[];
        for(const statement of statements){const r=await client.query(statement.sql,statement.values);results.push({success:true,results:r.rows,meta:{changes:r.rowCount}});}
        await client.query('COMMIT');return results;
      }catch(error){
        // Preserve the original failure and evict a connection that cannot roll back.
        try{await client.query('ROLLBACK');}catch(rollbackError){releaseError=rollbackError;}
        throw error;
      }finally{client.release(releaseError);}
    },
  };
}
