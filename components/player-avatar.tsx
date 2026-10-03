import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function PlayerAvatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  return <Avatar className={cn("size-10 border border-white/10", className)}>
    <AvatarImage src={image || undefined} alt={`${name} profil fotoğrafı`} referrerPolicy="no-referrer" />
    <AvatarFallback className="bg-emerald-950 font-bold text-emerald-300">{name.trim().slice(0, 2).toLocaleUpperCase("tr-TR")}</AvatarFallback>
  </Avatar>;
}