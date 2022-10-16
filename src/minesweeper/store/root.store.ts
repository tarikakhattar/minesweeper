import { createLoggingMetaReducer } from '@tinyslice/core';
import { take, tap } from 'rxjs';
import packageJson from '../../../package.json';
import { scope } from './scope';

import { TinySliceDevtoolPlugin } from '@tinyslice/devtools-plugin';
export interface RootState {
	debug: boolean;
}

export const PACKAGE_NAME_AND_VERSION = `${packageJson.displayName} (${packageJson.version})`;
export const rootSlice$ = scope.createRootSlice(
	{
		debug: true,
	} as RootState,
	{
		plugins: [
			new TinySliceDevtoolPlugin<RootState>({
				name: PACKAGE_NAME_AND_VERSION,
			}),
		],
		useDefaultLogger: true,
	}
);

export const debug$ = rootSlice$.slice('debug');
/*
scope.createEffect(
	debug$.pipe(
		switchMap((debug) => {
			if (debug) {
				return import('@tinyslice/devtools-plugin');
			} else {
				return of(undefined);
			}
		}),
		tap((pluginBundle) =>
			rootSlice$.setPlugins(
				pluginBundle
					? [
							new pluginBundle.TinySliceDevtoolPlugin<RootState>({
								name: PACKAGE_NAME_AND_VERSION,
							}),
					  ]
					: []
			)
		)
	)
);*/

scope.createEffect(
	debug$.pipe(
		take(0),
		tap((debug) =>
			rootSlice$.setMetaReducers(debug ? [createLoggingMetaReducer<RootState>()] : [])
		)
	)
);
