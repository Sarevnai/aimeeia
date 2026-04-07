/**
 * DemoRequestSheet — Sheet lateral com formulario de pedido de demo.
 *
 * Aberto/fechado via DemoSheetContext. Submete para tabela
 * public.demo_requests no Supabase (policy anon INSERT).
 * Captura UTMs e user_agent do navegador automaticamente.
 *
 * Estados:
 * - formulario inicial (dados preenchidos)
 * - loading (botao disabled durante insert)
 * - success (substitui form por confirmacao com CheckCircle2)
 * - erro (toast via sonner, form continua visivel)
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { useDemoSheet } from "@/components/landing/demo-sheet-context";
import {
  demoRequestSchema,
  type DemoRequestFormValues,
  TAMANHO_EQUIPE_OPTIONS,
} from "@/lib/demo-request-schema";

// ── Helpers ────────────────────────────────────────────────────────────────
function readUtmParams() {
  if (typeof window === "undefined") {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
  };
}

// ── Component ──────────────────────────────────────────────────────────────
export default function DemoRequestSheet() {
  const { isOpen, close } = useDemoSheet();
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<DemoRequestFormValues>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: {
      nome: "",
      email: "",
      telefone: "",
      imobiliaria: "",
      cidade: "",
      tamanho_equipe: undefined as unknown as DemoRequestFormValues["tamanho_equipe"],
      mensagem: "",
    },
  });

  async function onSubmit(values: DemoRequestFormValues) {
    setIsSubmitting(true);
    try {
      const utms = readUtmParams();
      const userAgent =
        typeof navigator !== "undefined" ? navigator.userAgent : null;

      const { error } = await supabase.from("demo_requests").insert({
        nome: values.nome,
        email: values.email,
        telefone: values.telefone,
        imobiliaria: values.imobiliaria,
        cidade: values.cidade,
        tamanho_equipe: values.tamanho_equipe,
        mensagem: values.mensagem || null,
        status: "new",
        utm_source: utms.utm_source,
        utm_medium: utms.utm_medium,
        utm_campaign: utms.utm_campaign,
        user_agent: userAgent,
      });

      if (error) throw error;

      setIsSuccess(true);
      form.reset();
    } catch (err) {
      console.error("[DemoRequestSheet] insert failed:", err);
      toast.error(
        "Não foi possível enviar seu pedido agora. Tente novamente em alguns minutos."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Reset success state on close so next open starts fresh
  function handleOpenChange(next: boolean) {
    if (!next) {
      close();
      // allow close animation then reset
      setTimeout(() => setIsSuccess(false), 300);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle className="text-2xl">
            Agende uma demo da Aimee.iA
          </SheetTitle>
          <SheetDescription>
            Conte sobre sua operação e a gente mostra, ao vivo, como a Aimee
            pode atender seus leads no WhatsApp.
          </SheetDescription>
        </SheetHeader>

        {isSuccess ? (
          // ── Success state ─────────────────────────────────────────
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <h3 className="text-xl font-semibold">Recebemos seu pedido!</h3>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Obrigado! Nossa equipe vai entrar em contato em até 1 dia útil
              para agendar a demo. Enquanto isso, fique à vontade pra explorar
              o site.
            </p>
            <Button
              variant="outline"
              className="mt-8"
              onClick={() => handleOpenChange(false)}
            >
              Fechar
            </Button>
          </div>
        ) : (
          // ── Form state ────────────────────────────────────────────
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-6 space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="demo-nome">
                Nome completo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="demo-nome"
                placeholder="Maria Silva"
                autoComplete="name"
                {...form.register("nome")}
              />
              {form.formState.errors.nome && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.nome.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="demo-email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="demo-email"
                  type="email"
                  placeholder="maria@imobiliaria.com.br"
                  autoComplete="email"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="demo-telefone">
                  Telefone / WhatsApp <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="demo-telefone"
                  type="tel"
                  placeholder="(48) 99999-9999"
                  autoComplete="tel"
                  {...form.register("telefone")}
                />
                {form.formState.errors.telefone && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.telefone.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="demo-imobiliaria">
                  Imobiliária <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="demo-imobiliaria"
                  placeholder="Imobiliária Modelo"
                  autoComplete="organization"
                  {...form.register("imobiliaria")}
                />
                {form.formState.errors.imobiliaria && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.imobiliaria.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="demo-cidade">
                  Cidade <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="demo-cidade"
                  placeholder="Florianópolis"
                  autoComplete="address-level2"
                  {...form.register("cidade")}
                />
                {form.formState.errors.cidade && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.cidade.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="demo-tamanho">
                Tamanho da equipe <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.watch("tamanho_equipe")}
                onValueChange={(v) =>
                  form.setValue(
                    "tamanho_equipe",
                    v as DemoRequestFormValues["tamanho_equipe"],
                    { shouldValidate: true }
                  )
                }
              >
                <SelectTrigger id="demo-tamanho">
                  <SelectValue placeholder="Quantos corretores?" />
                </SelectTrigger>
                <SelectContent>
                  {TAMANHO_EQUIPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.tamanho_equipe && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.tamanho_equipe.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="demo-mensagem">
                Mensagem (opcional)
              </Label>
              <Textarea
                id="demo-mensagem"
                rows={3}
                placeholder="Conte um pouco sobre seu desafio atual com leads…"
                {...form.register("mensagem")}
              />
              {form.formState.errors.mensagem && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.mensagem.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando…
                </>
              ) : (
                "Solicitar demo"
              )}
            </Button>

            <p className="text-center text-[11px] text-muted-foreground">
              Ao enviar, você concorda em receber contato da nossa equipe
              comercial. Seus dados são protegidos conforme a LGPD.
            </p>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
