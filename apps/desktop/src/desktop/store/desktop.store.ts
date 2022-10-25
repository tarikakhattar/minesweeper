import type { CoordinateLike } from '@alexaegis/desktop-common';
import {
	entitySliceReducerWithPrecompute,
	getNextKeyStrategy,
	getObjectKeysAsNumbers,
	ifLatestFrom,
	isNonNullable,
	isNullish,
	PremadeGetNext,
} from '@tinyslice/core';
import { filter, map, take } from 'rxjs';
import type { MinesweeperGame } from '../../minesweeper/store/minesweeper.interface';
import { createMineSweeperGame } from '../../minesweeper/store/minesweeper.store';
import type { ResizeData } from '../components/resizable.function';
import {
	initialWindowState,
	type BaseWindowState,
	type WindowState,
} from '../components/window-state.interface';

import { capitalize } from '@alexaegis/desktop-common';
import { documentPointerdown$, rootSlice$ } from '../../root.store';

import minesweeperIcon from '../../assets/desktop/minesweeper.png';

export type ProcessId = string;

export enum ProgramName {
	MINESWEEPER = 'minesweeper',
	UNKNOWN = 'unknown',
}

export interface ProgramState {
	name: ProgramName;
	title: string;
	icon?: string;
	initialWindowState: Partial<BaseWindowState>;
}

export interface ShortcutState {
	name: string;
	icon?: string;
	program: ProgramName;
	position: CoordinateLike;
}

export interface DesktopState {
	windows: Record<ProcessId, WindowState>;
	programs: Record<ProgramName, ProgramState>;
	shortcuts: Record<string, ShortcutState>;
	activeProcessId: ProcessId | undefined;
	lastSpawned: ProcessId | undefined;
	nextProcessId: ProcessId;
	startMenuOpen: boolean;
}

const initialInstalledPrograms: Partial<Record<ProgramName, ProgramState>> = {
	[ProgramName.MINESWEEPER]: {
		name: ProgramName.MINESWEEPER,
		title: capitalize(ProgramName.MINESWEEPER),
		icon: minesweeperIcon,
		initialWindowState: {
			fitContent: true,
			icon: minesweeperIcon,
		},
	},
};

export const desktop$ = rootSlice$.addSlice(
	'desktop',
	{
		windows: {},
		programs: initialInstalledPrograms,
		shortcuts: Object.values(initialInstalledPrograms).reduce((acc, next, shortcutId) => {
			acc[shortcutId] = {
				name: next.title,
				position: { x: 0, y: shortcutId * 32 },
				program: next.name,
				icon: next.icon,
			};

			return acc;
		}, {} as Record<string, ShortcutState>),
		activeProcessId: undefined,
		lastSpawned: undefined,
		startMenuOpen: false,
		nextProcessId: '0',
	} as DesktopState,
	{
		defineInternals: (slice) => {
			const actions = {
				spawnProgram: slice.createAction<ProgramName>('spawn'),
				activateProgram: slice.createAction<ProcessId | undefined>('activate'),
				moveShortcut: slice.createAction<number[]>('move shortcuts'),
			};

			return { actions };
		},
	}
);

export const SHORTCUT_HEIGHT = 50;
export const SHORTCUT_WIDTH = 75;

export const snapShortcutPosition = (position: CoordinateLike): CoordinateLike => {
	return {
		x: Math.floor(
			position.x - ((position.x + SHORTCUT_WIDTH / 2) % SHORTCUT_WIDTH) + SHORTCUT_WIDTH / 2
		),
		y: Math.floor(
			position.y -
				((position.y + SHORTCUT_HEIGHT / 2) % SHORTCUT_HEIGHT) +
				SHORTCUT_HEIGHT / 2
		),
	};
};

export const shortcuts$ = desktop$.slice('shortcuts', {
	reducers: [],
});

export const dicedShortcuts = shortcuts$.dice(
	{
		name: 'undefined',
		program: ProgramName.UNKNOWN,
		position: { x: 0, y: 0 },
		icon: undefined,
	} as ShortcutState,
	{
		getAllKeys: getObjectKeysAsNumbers,
		getNextKey: getNextKeyStrategy(PremadeGetNext.nextSmallest),
		defineInternals: (slice) => {
			const position$ = slice.slice('position');

			return { position$ };
		},
	}
);

export const programs$ = desktop$.slice('programs');
export const startMenuOpen$ = desktop$.slice('startMenuOpen');

export const dicedPrograms = programs$.dice(
	{
		name: ProgramName.UNKNOWN,
		title: ProgramName.UNKNOWN,
		icon: undefined,
		initialWindowState: {},
	} as ProgramState,
	{
		getAllKeys: (state) => Object.keys(state) as ProgramName[],
		getNextKey: () => ProgramName.UNKNOWN,
	}
);

const getNextProcessId = (keys: ProcessId[]) =>
	(keys.map((key) => parseInt(key, 10)).reduce((a, b) => (a > b ? a : b), 0) + 1).toString();

export const windows$ = desktop$.slice('windows', {
	reducers: [
		desktop$.internals.actions.spawnProgram.reduce((state, program) => {
			const processId = getNextProcessId(Object.keys(state));
			const spawnedWindow: WindowState = {
				...initialWindowState,
				...desktop$.value.programs[program]?.initialWindowState,
				processId,
				program,
				title: program,
				zIndex: Object.keys(state).length + 1,
			};
			return { ...state, [processId]: spawnedWindow };
		}),
		desktop$.internals.actions.activateProgram.reduce(
			entitySliceReducerWithPrecompute(
				(state, payload) => {
					let windows: WindowState[] = Object.values(state);

					if (payload) {
						windows = windows.filter(
							(windowState) => windowState.processId !== payload
						);
						windows.sort((a, b) => a.zIndex - b.zIndex);
						windows.push(state[payload]);
					}

					const indexMap = windows.reduce((acc, next, i) => {
						acc.set(next.processId, i + 1);
						return acc;
					}, new Map<string, number>());

					return {
						indexMap,
					};
				},
				(key, windowState, payload, { indexMap }) => {
					if (payload) {
						return {
							...windowState,
							zIndex: indexMap.get(key) ?? 0,
							active: windowState.processId === payload,
						};
					} else {
						return {
							...windowState,
							active: false,
						};
					}
				}
			)
		),
	],
	defineInternals: (slice) => {
		const activeWindowCount$ = slice.pipe(
			map(
				(windows) =>
					Object.values(windows).filter((windowState) => windowState.active).length
			)
		);

		return { activeWindowCount$ };
	},
});

desktop$.createEffect(
	documentPointerdown$.pipe(
		filter((event) => {
			const elementsUnderPointer = document.elementsFromPoint(event.pageX, event.pageY);
			return !elementsUnderPointer.some((element) => element.classList.contains('window'));
		}),
		ifLatestFrom(
			windows$.internals.activeWindowCount$,
			(activeWindowCount) => activeWindowCount > 0
		),
		map(() => desktop$.internals.actions.activateProgram.makePacket(undefined))
	)
);

export const resizeWindow = (
	windowState: BaseWindowState,
	resizeData: ResizeData
): BaseWindowState => {
	if (isNullish(resizeData.height) && isNullish(resizeData.width)) {
		return windowState;
	} else {
		const nextWindowState = { ...windowState };

		if (isNonNullable(resizeData.width) && resizeData.width >= nextWindowState.minWidth) {
			nextWindowState.width = resizeData.width;
			if (resizeData.moveX) {
				nextWindowState.position = {
					...nextWindowState.position,
					x: nextWindowState.position.x + resizeData.moveX,
				};
			}
		}

		if (isNonNullable(resizeData.height) && resizeData.height >= nextWindowState.minHeight) {
			nextWindowState.height = resizeData.height;
			if (resizeData.moveY) {
				nextWindowState.position = {
					...nextWindowState.position,
					y: nextWindowState.position.y + resizeData.moveY,
				};
			}
		}
		return nextWindowState;
	}
};

export const dicedWindows = windows$.dice(initialWindowState, {
	getAllKeys: (state) => Object.keys(state),
	getNextKey: getNextProcessId,
	defineInternals: (windowSlice) => {
		const WINDOW_ACTION = '[window]';

		const windowActions = {
			maximize: windowSlice.createAction(`${WINDOW_ACTION} maximize`),
			minimize: windowSlice.createAction(`${WINDOW_ACTION} minimize`),
			restore: windowSlice.createAction(`${WINDOW_ACTION} restore`),
			move: windowSlice.createAction<CoordinateLike>(`${WINDOW_ACTION} move`),
			resize: windowSlice.createAction<ResizeData>(`${WINDOW_ACTION} resize`),
		};

		windowSlice.addReducers([windowActions.resize.reduce(resizeWindow)]);

		const maximized$ = windowSlice.slice('maximized', {
			reducers: [
				windowActions.maximize.reduce(() => true),
				windowActions.restore.reduce(() => false),
			],
		});

		const position$ = windowSlice.slice('position', {
			reducers: [
				windowActions.move.reduce((state, payload) => ({
					x: state.x + payload.x,
					y: state.y + payload.y,
				})),
			],
		});

		let minesweeperGame: MinesweeperGame | undefined;
		if (windowSlice.value.program === ProgramName.MINESWEEPER) {
			minesweeperGame = createMineSweeperGame(windowSlice, 'programData');
		}

		return { windowActions, minesweeperGame, position$, maximized$ };
	},
	reducers: [],
});

export type DicedWindow = ReturnType<typeof dicedWindows['get']>;

export const isProgramSpawned$ = (program: ProgramName) =>
	dicedWindows.some$((window) => window.program === program);

export const isShortcutPresent$ = (program: ProgramName) =>
	dicedShortcuts.some$((shortcut) => shortcut.program === program);

export const isMinesweeperSpawned$ = isProgramSpawned$(ProgramName.MINESWEEPER);

windows$.createEffect(
	isMinesweeperSpawned$.pipe(
		take(1),
		filter((is) => !is),
		map(() => desktop$.internals.actions.spawnProgram.makePacket(ProgramName.MINESWEEPER))
	)
);
