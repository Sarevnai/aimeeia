import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Home, BedDouble, Car, Maximize2 } from "lucide-react";

interface PropertyCardProps {
  codigo: string;
  tipo: string;
  bairro: string;
  cidade?: string;
  preco_formatado?: string;
  foto_url?: string;
  caption?: string;
  link?: string;
  quartos?: number;
  suites?: number;
  vagas?: number;
  area_util?: number;
}

export function PropertyCard({
  codigo,
  tipo,
  bairro,
  cidade,
  preco_formatado,
  foto_url,
  caption,
  link,
  quartos,
  suites,
  vagas,
  area_util,
}: PropertyCardProps) {
  return (
    <Card className="overflow-hidden max-w-[320px] bg-[#e1ffc7] border-0 shadow-sm rounded-lg">
      {/* Image area */}
      <div className="relative">
        {foto_url ? (
          <img
            src={foto_url}
            alt={`${tipo} em ${bairro}`}
            className="w-full h-44 object-cover rounded-t-lg"
          />
        ) : (
          <div className="w-full h-44 bg-gray-200 flex items-center justify-center rounded-t-lg">
            <Home className="w-10 h-10 text-gray-400" />
          </div>
        )}

        {/* Price badge overlay */}
        {preco_formatado && (
          <Badge className="absolute top-2 right-2 bg-black/70 text-white text-xs font-semibold hover:bg-black/70">
            {preco_formatado}
          </Badge>
        )}
      </div>

      {/* Caption */}
      <div className="px-3 pt-2 pb-1">
        {caption && (
          <p className="text-[13px] text-gray-800 leading-snug mb-2">
            {caption}
          </p>
        )}

        {/* Badges row */}
        <div className="flex flex-wrap gap-1 mb-2">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {tipo}
          </Badge>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {bairro}
            {cidade ? `, ${cidade}` : ""}
          </Badge>
          {quartos != null && quartos > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
              <BedDouble className="w-3 h-3" />
              {quartos}
              {suites != null && suites > 0 ? ` (${suites}s)` : ""}
            </Badge>
          )}
          {vagas != null && vagas > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
              <Car className="w-3 h-3" />
              {vagas}
            </Badge>
          )}
          {area_util != null && area_util > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
              <Maximize2 className="w-3 h-3" />
              {area_util}m²
            </Badge>
          )}
        </div>

        {/* Link */}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mb-2"
          >
            <ExternalLink className="w-3 h-3" />
            Ver imovel
          </a>
        )}

        {/* Codigo + timestamp style */}
        <p className="text-[10px] text-gray-500 text-right pb-1">
          Cod. {codigo}
        </p>
      </div>
    </Card>
  );
}
