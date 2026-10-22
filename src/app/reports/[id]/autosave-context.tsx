"use client";
import {createContext,useContext,type ReactNode} from "react";
const Context=createContext<{version:string;enabled:boolean}>({version:"",enabled:false});
export function AutosaveContext({version,enabled,children}:{version:string;enabled:boolean;children:ReactNode}){return <Context value={{version,enabled}}>{children}</Context>;}
export function useAutosaveContext(){return useContext(Context);}
