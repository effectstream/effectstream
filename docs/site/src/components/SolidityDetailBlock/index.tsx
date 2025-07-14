import React from 'react';
import styles from './styles.module.css';

const SolidityDetailBlock = (
    {
        title,
        params,
        visibility,
        anchor,
        children
    }: {
        title: string,
        params: string,
        visibility: string,
        anchor: string,
        children: React.ReactNode
    }
) => {
    return (
        <table id={anchor} className="table table-auto w-full">
            <tbody>
                <tr style={{ fontFamily: "'Roboto Mono', monospace" }} className="bg-[#030909]">
                    <td>
                        <div className="flex justify-between">
                            <span><b>{title}</b>{params}</span>
                            <span>{visibility}<a className="ml-4" href={`#${anchor}`}>#</a></span>
                        </div>
                    </td>
                </tr>
                <tr className="bg-black text-white">
                    <td className={styles.contentPadding}>{children}</td>
                </tr>
            </tbody>
        </table>
    );
};

  
export default SolidityDetailBlock;
