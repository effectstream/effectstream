import { BlockItem } from "./BlockItem.tsx";

interface Block {
  number: number;
  hash: string;
  timestamp: Date;
}

interface BlockRowProps {
  title: string;
  blockTime: string;
  blocks: Block[];
  isMainColumn?: boolean;
  newBlockIndex?: number;
}

export function BlockRow({
  title,
  blockTime,
  blocks,
  isMainColumn = false,
  newBlockIndex,
}: BlockRowProps) {
  // Remove duplicate blocks to prevent React key conflicts
  const uniqueBlocks = blocks.filter((block, index, array) =>
    index ===
      array.findIndex((b) => b.number === block.number && b.hash === block.hash)
  );

  return (
    <div className={`column ${isMainColumn ? "main-column" : ""}`}>
      <h2 className="column-title">
        {title} - Block Time: <span>{blockTime}</span>
      </h2>
      <div className="blocks-list">
        {uniqueBlocks.length === 0
          ? <div className="block-item placeholder">No Blocks Fetched</div>
          : uniqueBlocks.map((block, index) => (
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
