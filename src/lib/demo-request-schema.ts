/**
 * Zod schema + types do formulario de demo da landing.
 * Usado pelo react-hook-form no DemoRequestSheet e pelo insert Supabase.
 */
import { z } from "zod";

export const TAMANHO_EQUIPE_OPTIONS = [
  { value: "1-5", label: "1 a 5 corretores" },
  { value: "6-15", label: "6 a 15 corretores" },
  { value: "16-50", label: "16 a 50 corretores" },
  { value: "50+", label: "Mais de 50 corretores" },
] as const;

export const demoRequestSchema = z.object({
  nome: z
    .string()
    .min(2, "Nome muito curto")
    .max(120, "Nome muito longo"),
  email: z
    .string()
    .min(1, "Email obrigatório")
    .email("Email inválido"),
  telefone: z
    .string()
    .min(10, "Telefone incompleto")
    .max(20, "Telefone muito longo"),
  imobiliaria: z
    .string()
    .min(2, "Informe o nome da imobiliária")
    .max(120, "Nome muito longo"),
  cidade: z
    .string()
    .min(2, "Informe a cidade")
    .max(80, "Cidade muito longa"),
  tamanho_equipe: z.enum(["1-5", "6-15", "16-50", "50+"], {
    required_error: "Selecione o tamanho da equipe",
  }),
  mensagem: z
    .string()
    .max(500, "Máximo 500 caracteres")
    .optional()
    .or(z.literal("")),
});

export type DemoRequestFormValues = z.infer<typeof demoRequestSchema>;
