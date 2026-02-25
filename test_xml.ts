import { XMLParser } from "npm:fast-xml-parser@4.3.2";
import * as fs from "node:fs";

const xmlData = fs.readFileSync("/Users/ianveras/Downloads/xml-1372-8549.xml", "utf8");
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

const result = parser.parse(xmlData);
console.log("Root keys:", Object.keys(result));
if (result.Listings) {
    console.log("Listings keys:", Object.keys(result.Listings));
    if (result.Listings.Listing) {
        console.log("Is array?", Array.isArray(result.Listings.Listing));
        console.log("First item:", result.Listings.Listing[0]?.ListingID);
    }
}
