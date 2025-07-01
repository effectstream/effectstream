import React from 'react';

const ContractHeader = (
    {
        children, // title
        githubLink,
        anchor
    }: {
        children: React.ReactNode,
        githubLink: string,
        anchor: string,
    }
) => {
    return (
        <div id={anchor} className="flex justify-between">
            <h3 style={{ fontFamily: "'Roboto Mono', monospace" }}>{children}</h3>
            <span>
                <a href={githubLink}>
                    <img className="-mb-0.5 mr-2" width="16`" height="16" src="https://github.githubassets.com/favicons/favicon-dark.png" />
                </a>
                <a href={`#${anchor}`}>#</a>
            </span>
        </div>
    );
};

export default ContractHeader;
