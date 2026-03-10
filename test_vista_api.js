const url = new URL('http://lkaimobi-rest.vistahost.com.br/imoveis/listar');
url.searchParams.append('key', '528befe6fac66b81ffce206dc0edc756');
url.searchParams.append('showtotal', '1');

const pesquisaData = {
    fields: ["Codigo", "Categoria", "Bairro", "Cidade", "ValorVenda", "ValorLocacao", "Dormitorios", "Suites", "Vagas", "AreaTotal", "AreaPrivativa", "Caracteristicas", "InfraEstrutura", "DataAtualizacao"],
    paginacao: {
        pagina: 1,
        quantidade: 5
    }
};

url.searchParams.append('pesquisa', JSON.stringify(pesquisaData));

async function run() {
    console.log("Fetching:", url.toString());
    try {
        const res = await fetch(url.toString(), {
            headers: { 'Accept': 'application/json' }
        });
        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Response:", text.substring(0, 500));
    } catch (e) {
        console.error("HTTP error:", e.message);
    }
}
run();
