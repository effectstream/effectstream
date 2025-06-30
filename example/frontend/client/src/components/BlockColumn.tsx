import { BlockItem } from "./BlockItem";

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
  return (
    <div className={`column ${isMainColumn ? "main-column" : ""}`}>
      <h2 className="column-title">{title}</h2>
      <div className="block-time">
        Block Time: <span>{blockTime}</span>
      </div>
      <div className="blocks-list">
        {blocks.map((block, index) => (
          <BlockItem
            key={`${block.number}-${block.hash}`}
            block={block}
            isNew={newBlockIndex === index}
          />
        ))}
      </div>
    </div>
  );
}
