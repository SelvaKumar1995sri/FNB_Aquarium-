import { useState } from "react";

import { specificationToHtml } from "../../utils/specFormat";

export default function SpecificationAccordion({ content }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!content) return null;

  return (
    <div className="mt-6 border-t pt-4">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center justify-between w-full text-left font-semibold"
        aria-expanded={isOpen}
      >
        SPECIFICATION
        <span className="text-xl leading-none" aria-hidden="true">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && (
        <div
          className="mt-3 text-sm text-gray-700 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1"
          dangerouslySetInnerHTML={{ __html: specificationToHtml(content) }}
        />
      )}
    </div>
  );
}
