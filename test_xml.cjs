const { XMLParser } = require("fast-xml-parser");
const fs = require("fs");

const xmlData = fs.readFileSync("/Users/ianveras/Downloads/xml-1372-8549.xml", "utf8");
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

const result = parser.parse(xmlData);
let listingsToProcess = result.ListingDataFeed.Listings.Listing.slice(0, 3);

for (const listing of listingsToProcess) {
    try {
        const details = listing.Details || listing;
        const external_id = listing.PropertyID || listing.ListingID || listing.CodigoImovel || listing.id || Math.random().toString();
        const title = listing.Title || listing.TituloImovel || `${details.PropertyType || ''} em ${listing.Location?.Neighborhood || ''}`;
        const description = listing.Description || listing.Observacao || '';
        const price = parseFloat(details.ListPrice || listing.PrecoVenda || listing.PrecoLocacao || 0);
        const type = details.PropertyType || listing.TipoImovel || '';
        const bedrooms = parseInt(details.Bedrooms || listing.Dormitorios || 0);
        const bathrooms = parseInt(details.Bathrooms || listing.Banheiros || 0);
        const parking = parseInt(details.Garage || listing.Vagas || 0);
        const area = parseFloat(details.LivingArea || listing.AreaUtil || 0);

        const location = listing.Location || listing;
        const neighborhood = location.Neighborhood || location.Bairro || '';
        const city = location.City || location.Cidade || '';

        let images = [];
        const media = listing.Media || listing.Fotos?.Foto;
        if (media) {
            if (Array.isArray(media)) {
                images = media.map((m) => m.Item?.[0]?.url || m.Item?.url || m.Item || m.URLArquivo || m.URL || m);
            } else if (media.Item) {
                images = Array.isArray(media.Item) ? media.Item.map((m) => m.url || m) : [media.Item.url || media.Item];
            } else if (media.URLArquivo) {
                images = [media.URLArquivo];
            }
        }

        // The issue might be that m.#text is required in fast-xml-parser for tags with attributes
        // e.g., <Item medium="image">http...</Item> becomes { "@_medium": "image", "#text": "http..." }

        console.log(`Processing ID: ${external_id}`);
        console.log(`Title: ${title}, Price: ${price}, Area: ${area}, Images length: ${images.length}`);
        console.log("Raw media obj:", JSON.stringify(images[0]).substring(0, 100));

    } catch (err) {
        console.error(`Error processing listing:`, err);
    }
}
