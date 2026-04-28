import React from 'react';

type Line = {
    text: string,
    anchor: string,
};
type LineList = {
    category: string,
    lines: Line[]
};
const SolidityOutlineBlock = (
    {
        type,
        lists
    }: {
        type: string,
        lists: LineList[],
    }
) => {
    return (
      <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }} className="bg-es-bg-subtle p-4 rounded-es-md mb-8 border border-es-border">
        <h2 className="text-xl text-es-cyan font-bold mb-4">{type}</h2>
        {lists.filter(list => list.lines.length > 0).map((list, index, filteredList) => (
          <div key={index} className="relative">
            {list.category && (
              <h3 className="text-[0.7rem] text-es-text-tertiary font-semibold absolute top-0 right-0 px-2">
                {list.category}
              </h3>
            )}
            <ul className="list-none pl-0 mt-8">
              {list.lines.map((line, lineIndex) => (
                <li key={lineIndex} className="my-1">
                  <a href={`#${line.anchor}`} className={`hover:underline ${index !== 0 ? "text-es-text-secondary" : "text-es-text"}`}>
                    {line.text}
                  </a>
                </li>
              ))}
            </ul>
            {index !== filteredList.length - 1 && <hr className="border-t border-gray-300" />}
          </div>
        ))}
      </div>
    );
  };
  
  
export default SolidityOutlineBlock;
