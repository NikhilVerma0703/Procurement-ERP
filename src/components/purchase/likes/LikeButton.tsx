"use client";

// The ♥ on a list row and in a form's sidebar (Frappe: like-action, frappe.ui.toggle_like). Filled red
// when the viewer liked the record, an outline otherwise; beside it how many liked it (nothing at 0,
// "99+" past 99), and on hover who. A click likes or unlikes; the heart takes no second click until the
// server has answered, and then shows what is stored.
import { Heart } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleLikeAction } from "@/app/purchase/like-actions";
import { cn } from "@/lib/purchase/cn";
import { likesCountText, type LikeInfo, type LikeKind } from "@/lib/purchase/like-rules";

export function LikeButton({ kind, id, likes, canLike = true, onChange, className, showZero = false }: {
  kind: LikeKind;
  id: string;
  likes: LikeInfo;
  canLike?: boolean;
  /** After a like or unlike is stored (a form refreshes its timeline). */
  onChange?: (likes: LikeInfo) => void;
  className?: string;
  /** The form sidebar shows "0"; a list row shows nothing. */
  showZero?: boolean;
}) {
  const [state, setState] = useState(likes);
  useEffect(() => setState(likes), [likes]);
  const [pending, start] = useTransition();

  const click = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canLike || pending) return;
    start(async () => {
      const r = await toggleLikeAction(kind, id, !state.mine);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setState(r.value);
      onChange?.(r.value);
    });
  };

  return (
    <span className={cn("relative z-10 inline-flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={click}
        disabled={!canLike}
        aria-pressed={state.mine}
        aria-label={state.mine ? "Unlike" : "Like"}
        title={state.names.length ? state.names.join(", ") : undefined}
        className={cn("rounded p-0.5 leading-none", pending && "pointer-events-none opacity-60", !canLike && "cursor-default")}
      >
        <Heart className={cn("h-3.5 w-3.5", state.mine ? "fill-[#e24c4c] text-[#e24c4c]" : "text-gray-400 hover:text-gray-700")} aria-hidden />
      </button>
      <span className="min-w-[0.5rem] text-xs tabular-nums text-gray-500">{showZero ? String(state.count) : likesCountText(state.count)}</span>
    </span>
  );
}
