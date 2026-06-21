"use client";

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqCategory {
  category: string;
  items: FaqItem[];
}

export function FaqAccordion({ categories }: { categories: FaqCategory[] }) {
  return (
    <div className="space-y-10">
      {categories.map((cat) => (
        <section key={cat.category}>
          <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
            {cat.category}
          </h2>
          <div className="space-y-2">
            {cat.items.map((item) => (
              <details
                key={item.q}
                className="group border border-gray-100 rounded-xl bg-gray-50 hover:border-blue-200 hover:bg-blue-50/20 transition-colors"
              >
                <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none select-none font-semibold text-gray-900 text-sm sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 rounded-xl">
                  <span>{item.q}</span>
                  {/* Chevron — rotates open via group-open */}
                  <span
                    className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 group-open:bg-blue-600 group-open:text-white transition-colors"
                    aria-hidden="true"
                  >
                    <svg
                      className="w-3 h-3 transition-transform duration-200 group-open:rotate-180"
                      fill="none"
                      viewBox="0 0 10 6"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </summary>
                <div className="px-5 pb-5 pt-1 text-sm text-gray-600 leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
