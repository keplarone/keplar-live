// Preact + hooks + htm for generated apps, as one classic script exposing window.kui (no build step, no CDN).
import { h, render, Fragment, createContext, cloneElement, toChildArray, createRef } from "preact";
import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, useReducer, useContext, useId } from "preact/hooks";
import htm from "htm";
const html = htm.bind(h);
window.kui = { h, html, render, Fragment, createContext, cloneElement, toChildArray, createRef, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, useReducer, useContext, useId };
