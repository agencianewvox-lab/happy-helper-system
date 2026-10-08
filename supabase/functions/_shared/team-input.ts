export function validTeamInput(body: {name?:unknown;email?:unknown;password?:unknown;role?:unknown}) {
 const name=String(body.name||"").trim(),email=String(body.email||"").trim().toLowerCase(),password=String(body.password||""),role=body.role;
 return name.length>=2&&name.length<=100&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254&&password.length>=12&&password.length<=128&&(role==="gestor"||role==="social_media");
}

