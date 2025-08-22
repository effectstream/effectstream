import { BlockItem } from "./BlockItem.tsx";

interface Block {
  number: number;
  hash: string;
  timestamp: Date;
}

interface BlockColumnProps {
  title: string;
  blockTime: string;
  blocks: Block[];
  isMainColumn?: boolean;
  newBlockIndex?: number;
}

export function BlockColumn({
  title,
  blockTime,
  blocks,
  isMainColumn = false,
  newBlockIndex,
}: BlockColumnProps) {
  // Remove duplicate blocks to prevent React key conflicts
  const uniqueBlocks = blocks.filter((block, index, array) =>
    index ===
      array.findIndex((b) => b.number === block.number && b.hash === block.hash)
  );

  return (
    <div className={`column ${isMainColumn ? "main-column" : ""}`}>
      <h2 className="column-title">{title}</h2>
      <div className="block-time">
        Block Time: <span>{blockTime}</span>
      </div>
      <div className="blocks-list">
        {uniqueBlocks.map((block, index) => (
          <BlockItem
            key={`${index}-${block.number}-${block.hash}`}
            block={block}
            isNew={newBlockIndex === index}
          />
        ))}
      </div>
    </div>
  );
}
