export async function onRequestPost(context) {
  return new Response(JSON.stringify({ 
    error: "Extractor belum dipasang." 
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export async function onRequestGet(context) {
  return new Response(JSON.stringify({ 
    ok: true,
    message: "Extractor endpoint aktif."
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
