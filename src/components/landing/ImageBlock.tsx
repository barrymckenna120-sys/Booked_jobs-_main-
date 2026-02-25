interface ImageBlockProps {
  label: string;
  caption: string;
}

export const ImageBlock = ({ label, caption }: ImageBlockProps) => {
  return (
    <div className="section-container py-10">
      <div className="w-full rounded-xl bg-secondary border-2 border-dashed border-border flex items-center justify-center min-h-[220px] md:min-h-[320px]">
        <p className="text-muted-foreground font-semibold text-sm text-center px-6">{label}</p>
      </div>
      <p className="text-center text-sm text-subtle mt-4 font-medium">{caption}</p>
    </div>
  );
};
