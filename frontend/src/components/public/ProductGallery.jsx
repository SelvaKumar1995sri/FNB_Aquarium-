import { useState } from "react";

function MainImage({ image, alt }) {
  return (
    <div className="w-full max-w-md aspect-square bg-gray-50 rounded-lg overflow-hidden">
      <img src={image} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}

export default function ProductGallery({ images, productName }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!images || images.length === 0) return null;

  if (images.length === 1) {
    return <MainImage image={images[0].image} alt={images[0].alt_text || productName} />;
  }

  const selected = images[selectedIndex] ?? images[0];

  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      <div className="flex gap-2 overflow-x-auto md:max-h-[500px] md:flex-col md:overflow-y-auto md:overflow-x-visible">
        {images.map((img, index) => (
          <button
            key={img.id ?? index}
            type="button"
            onClick={() => setSelectedIndex(index)}
            aria-label={`View image ${index + 1} of ${images.length}`}
            aria-current={index === selectedIndex}
            className={`h-16 w-16 shrink-0 overflow-hidden rounded border-2 bg-gray-50 ${
              index === selectedIndex ? "border-brand-forest" : "border-transparent"
            }`}
          >
            <img
              src={img.image}
              alt={`${productName} thumbnail ${index + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
      <div className="flex-1">
        <MainImage image={selected.image} alt={selected.alt_text || productName} />
      </div>
    </div>
  );
}
