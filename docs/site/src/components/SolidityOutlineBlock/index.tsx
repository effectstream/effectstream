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
      <div style={{ fontFamily: "'Roboto Mono', monospace" }} className="bg-[#151B1B] p-4 rounded-lg mb-8">
        <h2 className="text-xl text-[#1cc489] font-bold mb-4">{type}</h2>
        {lists.filter(list => list.lines.length > 0).map((list, index, filteredList) => (
          <div key={index} className="relative">
            {list.category && (
              <h3 className="text-[0.7rem] text-[#688787] font-semibold absolute top-0 right-0 px-2">
                {list.category}
              </h3>
            )}
            <ul className="list-none pl-0 mt-8">
              {list.lines.map((line, lineIndex) => (
                <li key={lineIndex} className="my-1">
                  <a href={`#${line.anchor}`} className={`hover:underline ${index !== 0 ? "text-[#a9bcbc]" : "text-[#e2e9e9]"}`}>
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
