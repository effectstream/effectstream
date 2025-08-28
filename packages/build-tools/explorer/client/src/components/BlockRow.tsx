import { BlockItem } from "./BlockItem.tsx";

interface Block {
  number: number;
  hash: string;
  timestamp: Date;
}

interface BlockRowProps {
  title: string;
  blockTime?: string;
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
    <div className={`row ${isMainColumn ? "main-row" : ""}`}>
      <h2 className="row-title">
        {title}
        {blockTime ? ` - Block Time: ${blockTime}` : ""}
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
