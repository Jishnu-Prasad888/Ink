import React from "react";

type Mode = "edit" | "split" | "view";

interface ToolbarProps{
    mode : Mode,
    onModeChange : (mode:Mode) => void;
}

const modes:{value:Mode;label:string}[]=[
    {value:"edit",label:"Edit"},
    {value:"split",label:"Split mode"},
    {value:"view",label:"Preview"},
]

export const Toolbar = ({mode,onModeChange}:ToolbarProps) => {
    return (
            <div className="mode-switcher">
              {modes.map(({value,label})=>(
                <button
                    aria-pressed={mode === value}
                    className={`mode-btn${mode === value ? " active" : ""}`}
                    onClick={() => onModeChange(value)}
                  >
                    {label}
                </button>
              ))}
            </div>
    );
}