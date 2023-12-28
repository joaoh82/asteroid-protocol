/* eslint-disable */

import { AllTypesProps, ReturnTypes, Ops } from './const';
export const HOST = "http://localhost:8080/v1/graphql"


export const HEADERS = {}
export const apiSubscription = (options: chainOptions) => (query: string) => {
	try {
		const queryString = options[0] + '?query=' + encodeURIComponent(query);
		const wsString = queryString.replace('http', 'ws');
		const host = (options.length > 1 && options[1]?.websocket?.[0]) || wsString;
		const webSocketOptions = options[1]?.websocket || [host];
		const ws = new WebSocket(...webSocketOptions);
		return {
			ws,
			on: (e: (args: any) => void) => {
				ws.onmessage = (event: any) => {
					if (event.data) {
						const parsed = JSON.parse(event.data);
						const data = parsed.data;
						return e(data);
					}
				};
			},
			off: (e: (args: any) => void) => {
				ws.onclose = e;
			},
			error: (e: (args: any) => void) => {
				ws.onerror = e;
			},
			open: (e: () => void) => {
				ws.onopen = e;
			},
		};
	} catch {
		throw new Error('No websockets implemented');
	}
};
const handleFetchResponse = (response: Response): Promise<GraphQLResponse> => {
	if (!response.ok) {
		return new Promise((_, reject) => {
			response
				.text()
				.then((text) => {
					try {
						reject(JSON.parse(text));
					} catch (err) {
						reject(text);
					}
				})
				.catch(reject);
		});
	}
	return response.json() as Promise<GraphQLResponse>;
};

export const apiFetch =
	(options: fetchOptions) =>
		(query: string, variables: Record<string, unknown> = {}) => {
			const fetchOptions = options[1] || {};
			if (fetchOptions.method && fetchOptions.method === 'GET') {
				return fetch(`${options[0]}?query=${encodeURIComponent(query)}`, fetchOptions)
					.then(handleFetchResponse)
					.then((response: GraphQLResponse) => {
						if (response.errors) {
							throw new GraphQLError(response);
						}
						return response.data;
					});
			}
			return fetch(`${options[0]}`, {
				body: JSON.stringify({ query, variables }),
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				...fetchOptions,
			})
				.then(handleFetchResponse)
				.then((response: GraphQLResponse) => {
					if (response.errors) {
						throw new GraphQLError(response);
					}
					return response.data;
				});
		};

export const InternalsBuildQuery = ({
	ops,
	props,
	returns,
	options,
	scalars,
}: {
	props: AllTypesPropsType;
	returns: ReturnTypesType;
	ops: Operations;
	options?: OperationOptions;
	scalars?: ScalarDefinition;
}) => {
	const ibb = (
		k: string,
		o: InputValueType | VType,
		p = '',
		root = true,
		vars: Array<{ name: string; graphQLType: string }> = [],
	): string => {
		const keyForPath = purifyGraphQLKey(k);
		const newPath = [p, keyForPath].join(SEPARATOR);
		if (!o) {
			return '';
		}
		if (typeof o === 'boolean' || typeof o === 'number') {
			return k;
		}
		if (typeof o === 'string') {
			return `${k} ${o}`;
		}
		if (Array.isArray(o)) {
			const args = InternalArgsBuilt({
				props,
				returns,
				ops,
				scalars,
				vars,
			})(o[0], newPath);
			return `${ibb(args ? `${k}(${args})` : k, o[1], p, false, vars)}`;
		}
		if (k === '__alias') {
			return Object.entries(o)
				.map(([alias, objectUnderAlias]) => {
					if (typeof objectUnderAlias !== 'object' || Array.isArray(objectUnderAlias)) {
						throw new Error(
							'Invalid alias it should be __alias:{ YOUR_ALIAS_NAME: { OPERATION_NAME: { ...selectors }}}',
						);
					}
					const operationName = Object.keys(objectUnderAlias)[0];
					const operation = objectUnderAlias[operationName];
					return ibb(`${alias}:${operationName}`, operation, p, false, vars);
				})
				.join('\n');
		}
		const hasOperationName = root && options?.operationName ? ' ' + options.operationName : '';
		const keyForDirectives = o['__directives'] ?? '';
		const query = `{${Object.entries(o)
			.filter(([k]) => k !== '__directives')
			.map((e) => ibb(...e, [p, `field<>${keyForPath}`].join(SEPARATOR), false, vars))
			.join('\n')}}`;
		if (!root) {
			return `${k} ${keyForDirectives}${hasOperationName} ${query}`;
		}
		const varsString = vars.map((v) => `${v.name}: ${v.graphQLType}`).join(', ');
		return `${k} ${keyForDirectives}${hasOperationName}${varsString ? `(${varsString})` : ''} ${query}`;
	};
	return ibb;
};

export const Thunder =
	(fn: FetchFunction) =>
		<O extends keyof typeof Ops, SCLR extends ScalarDefinition, R extends keyof ValueTypes = GenericOperation<O>>(
			operation: O,
			graphqlOptions?: ThunderGraphQLOptions<SCLR>,
		) =>
			<Z extends ValueTypes[R]>(
				o: (Z & ValueTypes[R]) | ValueTypes[R],
				ops?: OperationOptions & { variables?: Record<string, unknown> },
			) =>
				fn(
					Zeus(operation, o, {
						operationOptions: ops,
						scalars: graphqlOptions?.scalars,
					}),
					ops?.variables,
				).then((data) => {
					if (graphqlOptions?.scalars) {
						return decodeScalarsInResponse({
							response: data,
							initialOp: operation,
							initialZeusQuery: o as VType,
							returns: ReturnTypes,
							scalars: graphqlOptions.scalars,
							ops: Ops,
						});
					}
					return data;
				}) as Promise<InputType<GraphQLTypes[R], Z, SCLR>>;

export const Chain = (...options: chainOptions) => Thunder(apiFetch(options));

export const SubscriptionThunder =
	(fn: SubscriptionFunction) =>
		<O extends keyof typeof Ops, SCLR extends ScalarDefinition, R extends keyof ValueTypes = GenericOperation<O>>(
			operation: O,
			graphqlOptions?: ThunderGraphQLOptions<SCLR>,
		) =>
			<Z extends ValueTypes[R]>(
				o: (Z & ValueTypes[R]) | ValueTypes[R],
				ops?: OperationOptions & { variables?: ExtractVariables<Z> },
			) => {
				const returnedFunction = fn(
					Zeus(operation, o, {
						operationOptions: ops,
						scalars: graphqlOptions?.scalars,
					}),
				) as SubscriptionToGraphQL<Z, GraphQLTypes[R], SCLR>;
				if (returnedFunction?.on && graphqlOptions?.scalars) {
					const wrapped = returnedFunction.on;
					returnedFunction.on = (fnToCall: (args: InputType<GraphQLTypes[R], Z, SCLR>) => void) =>
						wrapped((data: InputType<GraphQLTypes[R], Z, SCLR>) => {
							if (graphqlOptions?.scalars) {
								return fnToCall(
									decodeScalarsInResponse({
										response: data,
										initialOp: operation,
										initialZeusQuery: o as VType,
										returns: ReturnTypes,
										scalars: graphqlOptions.scalars,
										ops: Ops,
									}),
								);
							}
							return fnToCall(data);
						});
				}
				return returnedFunction;
			};

export const Subscription = (...options: chainOptions) => SubscriptionThunder(apiSubscription(options));
export const Zeus = <
	Z extends ValueTypes[R],
	O extends keyof typeof Ops,
	R extends keyof ValueTypes = GenericOperation<O>,
>(
	operation: O,
	o: (Z & ValueTypes[R]) | ValueTypes[R],
	ops?: {
		operationOptions?: OperationOptions;
		scalars?: ScalarDefinition;
	},
) =>
	InternalsBuildQuery({
		props: AllTypesProps,
		returns: ReturnTypes,
		ops: Ops,
		options: ops?.operationOptions,
		scalars: ops?.scalars,
	})(operation, o as VType);

export const ZeusSelect = <T>() => ((t: unknown) => t) as SelectionFunction<T>;

export const Selector = <T extends keyof ValueTypes>(key: T) => key && ZeusSelect<ValueTypes[T]>();

export const TypeFromSelector = <T extends keyof ValueTypes>(key: T) => key && ZeusSelect<ValueTypes[T]>();
export const Gql = Chain(HOST, {
	headers: {
		'Content-Type': 'application/json',
		...HEADERS,
	},
});

export const ZeusScalars = ZeusSelect<ScalarCoders>();

export const decodeScalarsInResponse = <O extends Operations>({
	response,
	scalars,
	returns,
	ops,
	initialZeusQuery,
	initialOp,
}: {
	ops: O;
	response: any;
	returns: ReturnTypesType;
	scalars?: Record<string, ScalarResolver | undefined>;
	initialOp: keyof O;
	initialZeusQuery: InputValueType | VType;
}) => {
	if (!scalars) {
		return response;
	}
	const builder = PrepareScalarPaths({
		ops,
		returns,
	});

	const scalarPaths = builder(initialOp as string, ops[initialOp], initialZeusQuery);
	if (scalarPaths) {
		const r = traverseResponse({ scalarPaths, resolvers: scalars })(initialOp as string, response, [ops[initialOp]]);
		return r;
	}
	return response;
};

export const traverseResponse = ({
	resolvers,
	scalarPaths,
}: {
	scalarPaths: { [x: string]: `scalar.${string}` };
	resolvers: {
		[x: string]: ScalarResolver | undefined;
	};
}) => {
	const ibb = (k: string, o: InputValueType | VType, p: string[] = []): unknown => {
		if (Array.isArray(o)) {
			return o.map((eachO) => ibb(k, eachO, p));
		}
		if (o == null) {
			return o;
		}
		const scalarPathString = p.join(SEPARATOR);
		const currentScalarString = scalarPaths[scalarPathString];
		if (currentScalarString) {
			const currentDecoder = resolvers[currentScalarString.split('.')[1]]?.decode;
			if (currentDecoder) {
				return currentDecoder(o);
			}
		}
		if (typeof o === 'boolean' || typeof o === 'number' || typeof o === 'string' || !o) {
			return o;
		}
		const entries = Object.entries(o).map(([k, v]) => [k, ibb(k, v, [...p, purifyGraphQLKey(k)])] as const);
		const objectFromEntries = entries.reduce<Record<string, unknown>>((a, [k, v]) => {
			a[k] = v;
			return a;
		}, {});
		return objectFromEntries;
	};
	return ibb;
};

export type AllTypesPropsType = {
	[x: string]:
	| undefined
	| `scalar.${string}`
	| 'enum'
	| {
		[x: string]:
		| undefined
		| string
		| {
			[x: string]: string | undefined;
		};
	};
};

export type ReturnTypesType = {
	[x: string]:
	| {
		[x: string]: string | undefined;
	}
	| `scalar.${string}`
	| undefined;
};
export type InputValueType = {
	[x: string]: undefined | boolean | string | number | [any, undefined | boolean | InputValueType] | InputValueType;
};
export type VType =
	| undefined
	| boolean
	| string
	| number
	| [any, undefined | boolean | InputValueType]
	| InputValueType;

export type PlainType = boolean | number | string | null | undefined;
export type ZeusArgsType =
	| PlainType
	| {
		[x: string]: ZeusArgsType;
	}
	| Array<ZeusArgsType>;

export type Operations = Record<string, string>;

export type VariableDefinition = {
	[x: string]: unknown;
};

export const SEPARATOR = '|';

export type fetchOptions = Parameters<typeof fetch>;
type websocketOptions = typeof WebSocket extends new (...args: infer R) => WebSocket ? R : never;
export type chainOptions = [fetchOptions[0], fetchOptions[1] & { websocket?: websocketOptions }] | [fetchOptions[0]];
export type FetchFunction = (query: string, variables?: Record<string, unknown>) => Promise<any>;
export type SubscriptionFunction = (query: string) => any;
type NotUndefined<T> = T extends undefined ? never : T;
export type ResolverType<F> = NotUndefined<F extends [infer ARGS, any] ? ARGS : undefined>;

export type OperationOptions = {
	operationName?: string;
};

export type ScalarCoder = Record<string, (s: unknown) => string>;

export interface GraphQLResponse {
	data?: Record<string, any>;
	errors?: Array<{
		message: string;
	}>;
}
export class GraphQLError extends Error {
	constructor(public response: GraphQLResponse) {
		super('');
		console.error(response);
	}
	override toString() {
		return 'GraphQL Response Error';
	}
}
export type GenericOperation<O> = O extends keyof typeof Ops ? typeof Ops[O] : never;
export type ThunderGraphQLOptions<SCLR extends ScalarDefinition> = {
	scalars?: SCLR | ScalarCoders;
};

const ExtractScalar = (mappedParts: string[], returns: ReturnTypesType): `scalar.${string}` | undefined => {
	if (mappedParts.length === 0) {
		return;
	}
	const oKey = mappedParts[0];
	const returnP1 = returns[oKey];
	if (typeof returnP1 === 'object') {
		const returnP2 = returnP1[mappedParts[1]];
		if (returnP2) {
			return ExtractScalar([returnP2, ...mappedParts.slice(2)], returns);
		}
		return undefined;
	}
	return returnP1 as `scalar.${string}` | undefined;
};

export const PrepareScalarPaths = ({ ops, returns }: { returns: ReturnTypesType; ops: Operations }) => {
	const ibb = (
		k: string,
		originalKey: string,
		o: InputValueType | VType,
		p: string[] = [],
		pOriginals: string[] = [],
		root = true,
	): { [x: string]: `scalar.${string}` } | undefined => {
		if (!o) {
			return;
		}
		if (typeof o === 'boolean' || typeof o === 'number' || typeof o === 'string') {
			const extractionArray = [...pOriginals, originalKey];
			const isScalar = ExtractScalar(extractionArray, returns);
			if (isScalar?.startsWith('scalar')) {
				const partOfTree = {
					[[...p, k].join(SEPARATOR)]: isScalar,
				};
				return partOfTree;
			}
			return {};
		}
		if (Array.isArray(o)) {
			return ibb(k, k, o[1], p, pOriginals, false);
		}
		if (k === '__alias') {
			return Object.entries(o)
				.map(([alias, objectUnderAlias]) => {
					if (typeof objectUnderAlias !== 'object' || Array.isArray(objectUnderAlias)) {
						throw new Error(
							'Invalid alias it should be __alias:{ YOUR_ALIAS_NAME: { OPERATION_NAME: { ...selectors }}}',
						);
					}
					const operationName = Object.keys(objectUnderAlias)[0];
					const operation = objectUnderAlias[operationName];
					return ibb(alias, operationName, operation, p, pOriginals, false);
				})
				.reduce((a, b) => ({
					...a,
					...b,
				}));
		}
		const keyName = root ? ops[k] : k;
		return Object.entries(o)
			.filter(([k]) => k !== '__directives')
			.map(([k, v]) => {
				// Inline fragments shouldn't be added to the path as they aren't a field
				const isInlineFragment = originalKey.match(/^...\s*on/) != null;
				return ibb(
					k,
					k,
					v,
					isInlineFragment ? p : [...p, purifyGraphQLKey(keyName || k)],
					isInlineFragment ? pOriginals : [...pOriginals, purifyGraphQLKey(originalKey)],
					false,
				);
			})
			.reduce((a, b) => ({
				...a,
				...b,
			}));
	};
	return ibb;
};

export const purifyGraphQLKey = (k: string) => k.replace(/\([^)]*\)/g, '').replace(/^[^:]*\:/g, '');

const mapPart = (p: string) => {
	const [isArg, isField] = p.split('<>');
	if (isField) {
		return {
			v: isField,
			__type: 'field',
		} as const;
	}
	return {
		v: isArg,
		__type: 'arg',
	} as const;
};

type Part = ReturnType<typeof mapPart>;

export const ResolveFromPath = (props: AllTypesPropsType, returns: ReturnTypesType, ops: Operations) => {
	const ResolvePropsType = (mappedParts: Part[]) => {
		const oKey = ops[mappedParts[0].v];
		const propsP1 = oKey ? props[oKey] : props[mappedParts[0].v];
		if (propsP1 === 'enum' && mappedParts.length === 1) {
			return 'enum';
		}
		if (typeof propsP1 === 'string' && propsP1.startsWith('scalar.') && mappedParts.length === 1) {
			return propsP1;
		}
		if (typeof propsP1 === 'object') {
			if (mappedParts.length < 2) {
				return 'not';
			}
			const propsP2 = propsP1[mappedParts[1].v];
			if (typeof propsP2 === 'string') {
				return rpp(
					`${propsP2}${SEPARATOR}${mappedParts
						.slice(2)
						.map((mp) => mp.v)
						.join(SEPARATOR)}`,
				);
			}
			if (typeof propsP2 === 'object') {
				if (mappedParts.length < 3) {
					return 'not';
				}
				const propsP3 = propsP2[mappedParts[2].v];
				if (propsP3 && mappedParts[2].__type === 'arg') {
					return rpp(
						`${propsP3}${SEPARATOR}${mappedParts
							.slice(3)
							.map((mp) => mp.v)
							.join(SEPARATOR)}`,
					);
				}
			}
		}
		return 'not';
	};
	const ResolveReturnType = (mappedParts: Part[]) => {
		if (mappedParts.length === 0) {
			return 'not';
		}
		const oKey = ops[mappedParts[0].v];
		const returnP1 = oKey ? returns[oKey] : returns[mappedParts[0].v];
		if (typeof returnP1 === 'object') {
			if (mappedParts.length < 2) return 'not';
			const returnP2 = returnP1[mappedParts[1].v];
			if (returnP2) {
				return rpp(
					`${returnP2}${SEPARATOR}${mappedParts
						.slice(2)
						.map((mp) => mp.v)
						.join(SEPARATOR)}`,
				);
			}
		}
		return 'not';
	};
	const rpp = (path: string): 'enum' | 'not' | `scalar.${string}` => {
		const parts = path.split(SEPARATOR).filter((l) => l.length > 0);
		const mappedParts = parts.map(mapPart);
		const propsP1 = ResolvePropsType(mappedParts);
		if (propsP1) {
			return propsP1;
		}
		const returnP1 = ResolveReturnType(mappedParts);
		if (returnP1) {
			return returnP1;
		}
		return 'not';
	};
	return rpp;
};

export const InternalArgsBuilt = ({
	props,
	ops,
	returns,
	scalars,
	vars,
}: {
	props: AllTypesPropsType;
	returns: ReturnTypesType;
	ops: Operations;
	scalars?: ScalarDefinition;
	vars: Array<{ name: string; graphQLType: string }>;
}) => {
	const arb = (a: ZeusArgsType, p = '', root = true): string => {
		if (typeof a === 'string') {
			if (a.startsWith(START_VAR_NAME)) {
				const [varName, graphQLType] = a.replace(START_VAR_NAME, '$').split(GRAPHQL_TYPE_SEPARATOR);
				const v = vars.find((v) => v.name === varName);
				if (!v) {
					vars.push({
						name: varName,
						graphQLType,
					});
				} else {
					if (v.graphQLType !== graphQLType) {
						throw new Error(
							`Invalid variable exists with two different GraphQL Types, "${v.graphQLType}" and ${graphQLType}`,
						);
					}
				}
				return varName;
			}
		}
		const checkType = ResolveFromPath(props, returns, ops)(p);
		if (checkType.startsWith('scalar.')) {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const [_, ...splittedScalar] = checkType.split('.');
			const scalarKey = splittedScalar.join('.');
			return (scalars?.[scalarKey]?.encode?.(a) as string) || JSON.stringify(a);
		}
		if (Array.isArray(a)) {
			return `[${a.map((arr) => arb(arr, p, false)).join(', ')}]`;
		}
		if (typeof a === 'string') {
			if (checkType === 'enum') {
				return a;
			}
			return `${JSON.stringify(a)}`;
		}
		if (typeof a === 'object') {
			if (a === null) {
				return `null`;
			}
			const returnedObjectString = Object.entries(a)
				.filter(([, v]) => typeof v !== 'undefined')
				.map(([k, v]) => `${k}: ${arb(v, [p, k].join(SEPARATOR), false)}`)
				.join(',\n');
			if (!root) {
				return `{${returnedObjectString}}`;
			}
			return returnedObjectString;
		}
		return `${a}`;
	};
	return arb;
};

export const resolverFor = <X, T extends keyof ResolverInputTypes, Z extends keyof ResolverInputTypes[T]>(
	type: T,
	field: Z,
	fn: (
		args: Required<ResolverInputTypes[T]>[Z] extends [infer Input, any] ? Input : any,
		source: any,
	) => Z extends keyof ModelTypes[T] ? ModelTypes[T][Z] | Promise<ModelTypes[T][Z]> | X : never,
) => fn as (args?: any, source?: any) => ReturnType<typeof fn>;

export type UnwrapPromise<T> = T extends Promise<infer R> ? R : T;
export type ZeusState<T extends (...args: any[]) => Promise<any>> = NonNullable<UnwrapPromise<ReturnType<T>>>;
export type ZeusHook<
	T extends (...args: any[]) => Record<string, (...args: any[]) => Promise<any>>,
	N extends keyof ReturnType<T>,
> = ZeusState<ReturnType<T>[N]>;

export type WithTypeNameValue<T> = T & {
	__typename?: boolean;
	__directives?: string;
};
export type AliasType<T> = WithTypeNameValue<T> & {
	__alias?: Record<string, WithTypeNameValue<T>>;
};
type DeepAnify<T> = {
	[P in keyof T]?: any;
};
type IsPayLoad<T> = T extends [any, infer PayLoad] ? PayLoad : T;
export type ScalarDefinition = Record<string, ScalarResolver>;

type IsScalar<S, SCLR extends ScalarDefinition> = S extends 'scalar' & { name: infer T }
	? T extends keyof SCLR
	? SCLR[T]['decode'] extends (s: unknown) => unknown
	? ReturnType<SCLR[T]['decode']>
	: unknown
	: unknown
	: S;
type IsArray<T, U, SCLR extends ScalarDefinition> = T extends Array<infer R>
	? InputType<R, U, SCLR>[]
	: InputType<T, U, SCLR>;
type FlattenArray<T> = T extends Array<infer R> ? R : T;
type BaseZeusResolver = boolean | 1 | string | Variable<any, string>;

type IsInterfaced<SRC extends DeepAnify<DST>, DST, SCLR extends ScalarDefinition> = FlattenArray<SRC> extends
	| ZEUS_INTERFACES
	| ZEUS_UNIONS
	? {
		[P in keyof SRC]: SRC[P] extends '__union' & infer R
		? P extends keyof DST
		? IsArray<R, '__typename' extends keyof DST ? DST[P] & { __typename: true } : DST[P], SCLR>
		: IsArray<R, '__typename' extends keyof DST ? { __typename: true } : Record<string, never>, SCLR>
		: never;
	}[keyof SRC] & {
		[P in keyof Omit<
			Pick<
				SRC,
				{
					[P in keyof DST]: SRC[P] extends '__union' & infer R ? never : P;
				}[keyof DST]
			>,
			'__typename'
		>]: IsPayLoad<DST[P]> extends BaseZeusResolver ? IsScalar<SRC[P], SCLR> : IsArray<SRC[P], DST[P], SCLR>;
	}
	: {
		[P in keyof Pick<SRC, keyof DST>]: IsPayLoad<DST[P]> extends BaseZeusResolver
		? IsScalar<SRC[P], SCLR>
		: IsArray<SRC[P], DST[P], SCLR>;
	};

export type MapType<SRC, DST, SCLR extends ScalarDefinition> = SRC extends DeepAnify<DST>
	? IsInterfaced<SRC, DST, SCLR>
	: never;
// eslint-disable-next-line @typescript-eslint/ban-types
export type InputType<SRC, DST, SCLR extends ScalarDefinition = {}> = IsPayLoad<DST> extends { __alias: infer R }
	? {
		[P in keyof R]: MapType<SRC, R[P], SCLR>[keyof MapType<SRC, R[P], SCLR>];
	} & MapType<SRC, Omit<IsPayLoad<DST>, '__alias'>, SCLR>
	: MapType<SRC, IsPayLoad<DST>, SCLR>;
export type SubscriptionToGraphQL<Z, T, SCLR extends ScalarDefinition> = {
	ws: WebSocket;
	on: (fn: (args: InputType<T, Z, SCLR>) => void) => void;
	off: (fn: (e: { data?: InputType<T, Z, SCLR>; code?: number; reason?: string; message?: string }) => void) => void;
	error: (fn: (e: { data?: InputType<T, Z, SCLR>; errors?: string[] }) => void) => void;
	open: () => void;
};

// eslint-disable-next-line @typescript-eslint/ban-types
export type FromSelector<SELECTOR, NAME extends keyof GraphQLTypes, SCLR extends ScalarDefinition = {}> = InputType<
	GraphQLTypes[NAME],
	SELECTOR,
	SCLR
>;

export type ScalarResolver = {
	encode?: (s: unknown) => string;
	decode?: (s: unknown) => unknown;
};

export type SelectionFunction<V> = <T>(t: T | V) => T;

type BuiltInVariableTypes = {
	['String']: string;
	['Int']: number;
	['Float']: number;
	['ID']: unknown;
	['Boolean']: boolean;
};
type AllVariableTypes = keyof BuiltInVariableTypes | keyof ZEUS_VARIABLES;
type VariableRequired<T extends string> = `${T}!` | T | `[${T}]` | `[${T}]!` | `[${T}!]` | `[${T}!]!`;
type VR<T extends string> = VariableRequired<VariableRequired<T>>;

export type GraphQLVariableType = VR<AllVariableTypes>;

type ExtractVariableTypeString<T extends string> = T extends VR<infer R1>
	? R1 extends VR<infer R2>
	? R2 extends VR<infer R3>
	? R3 extends VR<infer R4>
	? R4 extends VR<infer R5>
	? R5
	: R4
	: R3
	: R2
	: R1
	: T;

type DecomposeType<T, Type> = T extends `[${infer R}]`
	? Array<DecomposeType<R, Type>> | undefined
	: T extends `${infer R}!`
	? NonNullable<DecomposeType<R, Type>>
	: Type | undefined;

type ExtractTypeFromGraphQLType<T extends string> = T extends keyof ZEUS_VARIABLES
	? ZEUS_VARIABLES[T]
	: T extends keyof BuiltInVariableTypes
	? BuiltInVariableTypes[T]
	: any;

export type GetVariableType<T extends string> = DecomposeType<
	T,
	ExtractTypeFromGraphQLType<ExtractVariableTypeString<T>>
>;

type UndefinedKeys<T> = {
	[K in keyof T]-?: T[K] extends NonNullable<T[K]> ? never : K;
}[keyof T];

type WithNullableKeys<T> = Pick<T, UndefinedKeys<T>>;
type WithNonNullableKeys<T> = Omit<T, UndefinedKeys<T>>;

type OptionalKeys<T> = {
	[P in keyof T]?: T[P];
};

export type WithOptionalNullables<T> = OptionalKeys<WithNullableKeys<T>> & WithNonNullableKeys<T>;

export type Variable<T extends GraphQLVariableType, Name extends string> = {
	' __zeus_name': Name;
	' __zeus_type': T;
};

export type ExtractVariables<Query> = Query extends Variable<infer VType, infer VName>
	? { [key in VName]: GetVariableType<VType> }
	: Query extends [infer Inputs, infer Outputs]
	? ExtractVariables<Inputs> & ExtractVariables<Outputs>
	: Query extends string | number | boolean
	? // eslint-disable-next-line @typescript-eslint/ban-types
	{}
	: UnionToIntersection<{ [K in keyof Query]: WithOptionalNullables<ExtractVariables<Query[K]>> }[keyof Query]>;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export const START_VAR_NAME = `$ZEUS_VAR`;
export const GRAPHQL_TYPE_SEPARATOR = `__$GRAPHQL__`;

export const $ = <Type extends GraphQLVariableType, Name extends string>(name: Name, graphqlType: Type) => {
	return (START_VAR_NAME + name + GRAPHQL_TYPE_SEPARATOR + graphqlType) as unknown as Variable<Type, Name>;
};
type ZEUS_INTERFACES = never
export type ScalarCoders = {
	bigint?: ScalarResolver;
	json?: ScalarResolver;
	smallint?: ScalarResolver;
	timestamp?: ScalarResolver;
}
type ZEUS_UNIONS = never

export type ValueTypes = {
	/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
	["Int_comparison_exp"]: {
		_eq?: number | undefined | null | Variable<any, string>,
		_gt?: number | undefined | null | Variable<any, string>,
		_gte?: number | undefined | null | Variable<any, string>,
		_in?: Array<number> | undefined | null | Variable<any, string>,
		_is_null?: boolean | undefined | null | Variable<any, string>,
		_lt?: number | undefined | null | Variable<any, string>,
		_lte?: number | undefined | null | Variable<any, string>,
		_neq?: number | undefined | null | Variable<any, string>,
		_nin?: Array<number> | undefined | null | Variable<any, string>
	};
	/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
	["String_comparison_exp"]: {
		_eq?: string | undefined | null | Variable<any, string>,
		_gt?: string | undefined | null | Variable<any, string>,
		_gte?: string | undefined | null | Variable<any, string>,
		/** does the column match the given case-insensitive pattern */
		_ilike?: string | undefined | null | Variable<any, string>,
		_in?: Array<string> | undefined | null | Variable<any, string>,
		/** does the column match the given POSIX regular expression, case insensitive */
		_iregex?: string | undefined | null | Variable<any, string>,
		_is_null?: boolean | undefined | null | Variable<any, string>,
		/** does the column match the given pattern */
		_like?: string | undefined | null | Variable<any, string>,
		_lt?: string | undefined | null | Variable<any, string>,
		_lte?: string | undefined | null | Variable<any, string>,
		_neq?: string | undefined | null | Variable<any, string>,
		/** does the column NOT match the given case-insensitive pattern */
		_nilike?: string | undefined | null | Variable<any, string>,
		_nin?: Array<string> | undefined | null | Variable<any, string>,
		/** does the column NOT match the given POSIX regular expression, case insensitive */
		_niregex?: string | undefined | null | Variable<any, string>,
		/** does the column NOT match the given pattern */
		_nlike?: string | undefined | null | Variable<any, string>,
		/** does the column NOT match the given POSIX regular expression, case sensitive */
		_nregex?: string | undefined | null | Variable<any, string>,
		/** does the column NOT match the given SQL regular expression */
		_nsimilar?: string | undefined | null | Variable<any, string>,
		/** does the column match the given POSIX regular expression, case sensitive */
		_regex?: string | undefined | null | Variable<any, string>,
		/** does the column match the given SQL regular expression */
		_similar?: string | undefined | null | Variable<any, string>
	};
	["bigint"]: unknown;
	/** Boolean expression to compare columns of type "bigint". All fields are combined with logical 'AND'. */
	["bigint_comparison_exp"]: {
		_eq?: ValueTypes["bigint"] | undefined | null | Variable<any, string>,
		_gt?: ValueTypes["bigint"] | undefined | null | Variable<any, string>,
		_gte?: ValueTypes["bigint"] | undefined | null | Variable<any, string>,
		_in?: Array<ValueTypes["bigint"]> | undefined | null | Variable<any, string>,
		_is_null?: boolean | undefined | null | Variable<any, string>,
		_lt?: ValueTypes["bigint"] | undefined | null | Variable<any, string>,
		_lte?: ValueTypes["bigint"] | undefined | null | Variable<any, string>,
		_neq?: ValueTypes["bigint"] | undefined | null | Variable<any, string>,
		_nin?: Array<ValueTypes["bigint"]> | undefined | null | Variable<any, string>
	};
	/** ordering argument of a cursor */
	["cursor_ordering"]: cursor_ordering;
	/** columns and relationships of "inscription" */
	["inscription"]: AliasType<{
		chain_id?: boolean | `@${string}`,
		content_hash?: boolean | `@${string}`,
		content_path?: boolean | `@${string}`,
		content_size_bytes?: boolean | `@${string}`,
		creator?: boolean | `@${string}`,
		current_owner?: boolean | `@${string}`,
		date_created?: boolean | `@${string}`,
		height?: boolean | `@${string}`,
		id?: boolean | `@${string}`,
		metadata?: [{	/** JSON select path */
			path?: string | undefined | null | Variable<any, string>
		}, boolean | `@${string}`],
		transaction_hash?: boolean | `@${string}`,
		type?: boolean | `@${string}`,
		version?: boolean | `@${string}`,
		__typename?: boolean | `@${string}`
	}>;
	/** Boolean expression to filter rows from the table "inscription". All fields are combined with a logical 'AND'. */
	["inscription_bool_exp"]: {
		_and?: Array<ValueTypes["inscription_bool_exp"]> | undefined | null | Variable<any, string>,
		_not?: ValueTypes["inscription_bool_exp"] | undefined | null | Variable<any, string>,
		_or?: Array<ValueTypes["inscription_bool_exp"]> | undefined | null | Variable<any, string>,
		chain_id?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		content_hash?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		content_path?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		content_size_bytes?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		creator?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		current_owner?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		date_created?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
		height?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		metadata?: ValueTypes["json_comparison_exp"] | undefined | null | Variable<any, string>,
		transaction_hash?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		type?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		version?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
	};
	/** Ordering options when selecting data from "inscription". */
	["inscription_order_by"]: {
		chain_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		content_hash?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		content_path?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		content_size_bytes?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		creator?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		current_owner?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		date_created?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		height?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		metadata?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		transaction_hash?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		type?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		version?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
	};
	/** select columns of table "inscription" */
	["inscription_select_column"]: inscription_select_column;
	/** Streaming cursor of the table "inscription" */
	["inscription_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ValueTypes["inscription_stream_cursor_value_input"] | Variable<any, string>,
		/** cursor ordering */
		ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
	};
	/** Initial value of the column from where the streaming should start */
	["inscription_stream_cursor_value_input"]: {
		chain_id?: string | undefined | null | Variable<any, string>,
		content_hash?: string | undefined | null | Variable<any, string>,
		content_path?: string | undefined | null | Variable<any, string>,
		content_size_bytes?: number | undefined | null | Variable<any, string>,
		creator?: string | undefined | null | Variable<any, string>,
		current_owner?: string | undefined | null | Variable<any, string>,
		date_created?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
		height?: number | undefined | null | Variable<any, string>,
		id?: number | undefined | null | Variable<any, string>,
		metadata?: ValueTypes["json"] | undefined | null | Variable<any, string>,
		transaction_hash?: string | undefined | null | Variable<any, string>,
		type?: string | undefined | null | Variable<any, string>,
		version?: string | undefined | null | Variable<any, string>
	};
	["json"]: unknown;
	/** Boolean expression to compare columns of type "json". All fields are combined with logical 'AND'. */
	["json_comparison_exp"]: {
		_eq?: ValueTypes["json"] | undefined | null | Variable<any, string>,
		_gt?: ValueTypes["json"] | undefined | null | Variable<any, string>,
		_gte?: ValueTypes["json"] | undefined | null | Variable<any, string>,
		_in?: Array<ValueTypes["json"]> | undefined | null | Variable<any, string>,
		_is_null?: boolean | undefined | null | Variable<any, string>,
		_lt?: ValueTypes["json"] | undefined | null | Variable<any, string>,
		_lte?: ValueTypes["json"] | undefined | null | Variable<any, string>,
		_neq?: ValueTypes["json"] | undefined | null | Variable<any, string>,
		_nin?: Array<ValueTypes["json"]> | undefined | null | Variable<any, string>
	};
	/** column ordering options */
	["order_by"]: order_by;
	["query_root"]: AliasType<{
		inscription?: [{	/** distinct select on columns */
			distinct_on?: Array<ValueTypes["inscription_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
			limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
			order_by?: Array<ValueTypes["inscription_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["inscription_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["inscription"]],
		inscription_by_pk?: [{ id: number | Variable<any, string> }, ValueTypes["inscription"]],
		status?: [{	/** distinct select on columns */
			distinct_on?: Array<ValueTypes["status_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
			limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
			order_by?: Array<ValueTypes["status_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["status_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["status"]],
		status_by_pk?: [{ id: number | Variable<any, string> }, ValueTypes["status"]],
		token?: [{	/** distinct select on columns */
			distinct_on?: Array<ValueTypes["token_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
			limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
			order_by?: Array<ValueTypes["token_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["token_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["token"]],
		token_by_pk?: [{ id: number | Variable<any, string> }, ValueTypes["token"]],
		transaction?: [{	/** distinct select on columns */
			distinct_on?: Array<ValueTypes["transaction_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
			limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
			order_by?: Array<ValueTypes["transaction_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["transaction_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["transaction"]],
		transaction_by_pk?: [{ id: number | Variable<any, string> }, ValueTypes["transaction"]],
		__typename?: boolean | `@${string}`
	}>;
	["smallint"]: unknown;
	/** Boolean expression to compare columns of type "smallint". All fields are combined with logical 'AND'. */
	["smallint_comparison_exp"]: {
		_eq?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
		_gt?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
		_gte?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
		_in?: Array<ValueTypes["smallint"]> | undefined | null | Variable<any, string>,
		_is_null?: boolean | undefined | null | Variable<any, string>,
		_lt?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
		_lte?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
		_neq?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
		_nin?: Array<ValueTypes["smallint"]> | undefined | null | Variable<any, string>
	};
	/** columns and relationships of "status" */
	["status"]: AliasType<{
		chain_id?: boolean | `@${string}`,
		date_updated?: boolean | `@${string}`,
		id?: boolean | `@${string}`,
		last_processed_height?: boolean | `@${string}`,
		__typename?: boolean | `@${string}`
	}>;
	/** Boolean expression to filter rows from the table "status". All fields are combined with a logical 'AND'. */
	["status_bool_exp"]: {
		_and?: Array<ValueTypes["status_bool_exp"]> | undefined | null | Variable<any, string>,
		_not?: ValueTypes["status_bool_exp"] | undefined | null | Variable<any, string>,
		_or?: Array<ValueTypes["status_bool_exp"]> | undefined | null | Variable<any, string>,
		chain_id?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		date_updated?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
		id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		last_processed_height?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>
	};
	/** Ordering options when selecting data from "status". */
	["status_order_by"]: {
		chain_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		date_updated?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		last_processed_height?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
	};
	/** select columns of table "status" */
	["status_select_column"]: status_select_column;
	/** Streaming cursor of the table "status" */
	["status_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ValueTypes["status_stream_cursor_value_input"] | Variable<any, string>,
		/** cursor ordering */
		ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
	};
	/** Initial value of the column from where the streaming should start */
	["status_stream_cursor_value_input"]: {
		chain_id?: string | undefined | null | Variable<any, string>,
		date_updated?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
		id?: number | undefined | null | Variable<any, string>,
		last_processed_height?: number | undefined | null | Variable<any, string>
	};
	["subscription_root"]: AliasType<{
		inscription?: [{	/** distinct select on columns */
			distinct_on?: Array<ValueTypes["inscription_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
			limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
			order_by?: Array<ValueTypes["inscription_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["inscription_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["inscription"]],
		inscription_by_pk?: [{ id: number | Variable<any, string> }, ValueTypes["inscription"]],
		inscription_stream?: [{	/** maximum number of rows returned in a single batch */
			batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
			cursor: Array<ValueTypes["inscription_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["inscription_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["inscription"]],
		status?: [{	/** distinct select on columns */
			distinct_on?: Array<ValueTypes["status_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
			limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
			order_by?: Array<ValueTypes["status_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["status_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["status"]],
		status_by_pk?: [{ id: number | Variable<any, string> }, ValueTypes["status"]],
		status_stream?: [{	/** maximum number of rows returned in a single batch */
			batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
			cursor: Array<ValueTypes["status_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["status_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["status"]],
		token?: [{	/** distinct select on columns */
			distinct_on?: Array<ValueTypes["token_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
			limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
			order_by?: Array<ValueTypes["token_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["token_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["token"]],
		token_by_pk?: [{ id: number | Variable<any, string> }, ValueTypes["token"]],
		token_stream?: [{	/** maximum number of rows returned in a single batch */
			batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
			cursor: Array<ValueTypes["token_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["token_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["token"]],
		transaction?: [{	/** distinct select on columns */
			distinct_on?: Array<ValueTypes["transaction_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
			limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
			order_by?: Array<ValueTypes["transaction_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["transaction_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["transaction"]],
		transaction_by_pk?: [{ id: number | Variable<any, string> }, ValueTypes["transaction"]],
		transaction_stream?: [{	/** maximum number of rows returned in a single batch */
			batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
			cursor: Array<ValueTypes["transaction_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
			where?: ValueTypes["transaction_bool_exp"] | undefined | null | Variable<any, string>
		}, ValueTypes["transaction"]],
		__typename?: boolean | `@${string}`
	}>;
	["timestamp"]: unknown;
	/** Boolean expression to compare columns of type "timestamp". All fields are combined with logical 'AND'. */
	["timestamp_comparison_exp"]: {
		_eq?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
		_gt?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
		_gte?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
		_in?: Array<ValueTypes["timestamp"]> | undefined | null | Variable<any, string>,
		_is_null?: boolean | undefined | null | Variable<any, string>,
		_lt?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
		_lte?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
		_neq?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
		_nin?: Array<ValueTypes["timestamp"]> | undefined | null | Variable<any, string>
	};
	/** columns and relationships of "token" */
	["token"]: AliasType<{
		chain_id?: boolean | `@${string}`,
		content_path?: boolean | `@${string}`,
		content_size_bytes?: boolean | `@${string}`,
		creator?: boolean | `@${string}`,
		current_owner?: boolean | `@${string}`,
		date_created?: boolean | `@${string}`,
		decimals?: boolean | `@${string}`,
		height?: boolean | `@${string}`,
		id?: boolean | `@${string}`,
		launch_timestamp?: boolean | `@${string}`,
		max_supply?: boolean | `@${string}`,
		metadata?: boolean | `@${string}`,
		mint_page?: boolean | `@${string}`,
		name?: boolean | `@${string}`,
		per_wallet_limit?: boolean | `@${string}`,
		ticker?: boolean | `@${string}`,
		transaction_hash?: boolean | `@${string}`,
		version?: boolean | `@${string}`,
		__typename?: boolean | `@${string}`
	}>;
	/** Boolean expression to filter rows from the table "token". All fields are combined with a logical 'AND'. */
	["token_bool_exp"]: {
		_and?: Array<ValueTypes["token_bool_exp"]> | undefined | null | Variable<any, string>,
		_not?: ValueTypes["token_bool_exp"] | undefined | null | Variable<any, string>,
		_or?: Array<ValueTypes["token_bool_exp"]> | undefined | null | Variable<any, string>,
		chain_id?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		content_path?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		content_size_bytes?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		creator?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		current_owner?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		date_created?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
		decimals?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
		height?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		launch_timestamp?: ValueTypes["bigint_comparison_exp"] | undefined | null | Variable<any, string>,
		max_supply?: ValueTypes["bigint_comparison_exp"] | undefined | null | Variable<any, string>,
		metadata?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		mint_page?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		per_wallet_limit?: ValueTypes["bigint_comparison_exp"] | undefined | null | Variable<any, string>,
		ticker?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		transaction_hash?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		version?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
	};
	/** Ordering options when selecting data from "token". */
	["token_order_by"]: {
		chain_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		content_path?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		content_size_bytes?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		creator?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		current_owner?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		date_created?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		decimals?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		height?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		launch_timestamp?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		max_supply?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		metadata?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		mint_page?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		per_wallet_limit?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		ticker?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		transaction_hash?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		version?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
	};
	/** select columns of table "token" */
	["token_select_column"]: token_select_column;
	/** Streaming cursor of the table "token" */
	["token_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ValueTypes["token_stream_cursor_value_input"] | Variable<any, string>,
		/** cursor ordering */
		ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
	};
	/** Initial value of the column from where the streaming should start */
	["token_stream_cursor_value_input"]: {
		chain_id?: string | undefined | null | Variable<any, string>,
		content_path?: string | undefined | null | Variable<any, string>,
		content_size_bytes?: number | undefined | null | Variable<any, string>,
		creator?: string | undefined | null | Variable<any, string>,
		current_owner?: string | undefined | null | Variable<any, string>,
		date_created?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
		decimals?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
		height?: number | undefined | null | Variable<any, string>,
		id?: number | undefined | null | Variable<any, string>,
		launch_timestamp?: ValueTypes["bigint"] | undefined | null | Variable<any, string>,
		max_supply?: ValueTypes["bigint"] | undefined | null | Variable<any, string>,
		metadata?: string | undefined | null | Variable<any, string>,
		mint_page?: string | undefined | null | Variable<any, string>,
		name?: string | undefined | null | Variable<any, string>,
		per_wallet_limit?: ValueTypes["bigint"] | undefined | null | Variable<any, string>,
		ticker?: string | undefined | null | Variable<any, string>,
		transaction_hash?: string | undefined | null | Variable<any, string>,
		version?: string | undefined | null | Variable<any, string>
	};
	/** columns and relationships of "transaction" */
	["transaction"]: AliasType<{
		content?: boolean | `@${string}`,
		content_length?: boolean | `@${string}`,
		date_created?: boolean | `@${string}`,
		fees?: boolean | `@${string}`,
		gas_used?: boolean | `@${string}`,
		hash?: boolean | `@${string}`,
		height?: boolean | `@${string}`,
		id?: boolean | `@${string}`,
		status_message?: boolean | `@${string}`,
		__typename?: boolean | `@${string}`
	}>;
	/** Boolean expression to filter rows from the table "transaction". All fields are combined with a logical 'AND'. */
	["transaction_bool_exp"]: {
		_and?: Array<ValueTypes["transaction_bool_exp"]> | undefined | null | Variable<any, string>,
		_not?: ValueTypes["transaction_bool_exp"] | undefined | null | Variable<any, string>,
		_or?: Array<ValueTypes["transaction_bool_exp"]> | undefined | null | Variable<any, string>,
		content?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		content_length?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		date_created?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
		fees?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		gas_used?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		hash?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
		height?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
		status_message?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
	};
	/** Ordering options when selecting data from "transaction". */
	["transaction_order_by"]: {
		content?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		content_length?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		date_created?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		fees?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		gas_used?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		hash?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		height?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
		status_message?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
	};
	/** select columns of table "transaction" */
	["transaction_select_column"]: transaction_select_column;
	/** Streaming cursor of the table "transaction" */
	["transaction_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ValueTypes["transaction_stream_cursor_value_input"] | Variable<any, string>,
		/** cursor ordering */
		ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
	};
	/** Initial value of the column from where the streaming should start */
	["transaction_stream_cursor_value_input"]: {
		content?: string | undefined | null | Variable<any, string>,
		content_length?: number | undefined | null | Variable<any, string>,
		date_created?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
		fees?: string | undefined | null | Variable<any, string>,
		gas_used?: number | undefined | null | Variable<any, string>,
		hash?: string | undefined | null | Variable<any, string>,
		height?: number | undefined | null | Variable<any, string>,
		id?: number | undefined | null | Variable<any, string>,
		status_message?: string | undefined | null | Variable<any, string>
	}
}

export type ResolverInputTypes = {
	["schema"]: AliasType<{
		query?: ResolverInputTypes["query_root"],
		subscription?: ResolverInputTypes["subscription_root"],
		__typename?: boolean | `@${string}`
	}>;
	/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
	["Int_comparison_exp"]: {
		_eq?: number | undefined | null,
		_gt?: number | undefined | null,
		_gte?: number | undefined | null,
		_in?: Array<number> | undefined | null,
		_is_null?: boolean | undefined | null,
		_lt?: number | undefined | null,
		_lte?: number | undefined | null,
		_neq?: number | undefined | null,
		_nin?: Array<number> | undefined | null
	};
	/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
	["String_comparison_exp"]: {
		_eq?: string | undefined | null,
		_gt?: string | undefined | null,
		_gte?: string | undefined | null,
		/** does the column match the given case-insensitive pattern */
		_ilike?: string | undefined | null,
		_in?: Array<string> | undefined | null,
		/** does the column match the given POSIX regular expression, case insensitive */
		_iregex?: string | undefined | null,
		_is_null?: boolean | undefined | null,
		/** does the column match the given pattern */
		_like?: string | undefined | null,
		_lt?: string | undefined | null,
		_lte?: string | undefined | null,
		_neq?: string | undefined | null,
		/** does the column NOT match the given case-insensitive pattern */
		_nilike?: string | undefined | null,
		_nin?: Array<string> | undefined | null,
		/** does the column NOT match the given POSIX regular expression, case insensitive */
		_niregex?: string | undefined | null,
		/** does the column NOT match the given pattern */
		_nlike?: string | undefined | null,
		/** does the column NOT match the given POSIX regular expression, case sensitive */
		_nregex?: string | undefined | null,
		/** does the column NOT match the given SQL regular expression */
		_nsimilar?: string | undefined | null,
		/** does the column match the given POSIX regular expression, case sensitive */
		_regex?: string | undefined | null,
		/** does the column match the given SQL regular expression */
		_similar?: string | undefined | null
	};
	["bigint"]: unknown;
	/** Boolean expression to compare columns of type "bigint". All fields are combined with logical 'AND'. */
	["bigint_comparison_exp"]: {
		_eq?: ResolverInputTypes["bigint"] | undefined | null,
		_gt?: ResolverInputTypes["bigint"] | undefined | null,
		_gte?: ResolverInputTypes["bigint"] | undefined | null,
		_in?: Array<ResolverInputTypes["bigint"]> | undefined | null,
		_is_null?: boolean | undefined | null,
		_lt?: ResolverInputTypes["bigint"] | undefined | null,
		_lte?: ResolverInputTypes["bigint"] | undefined | null,
		_neq?: ResolverInputTypes["bigint"] | undefined | null,
		_nin?: Array<ResolverInputTypes["bigint"]> | undefined | null
	};
	/** ordering argument of a cursor */
	["cursor_ordering"]: cursor_ordering;
	/** columns and relationships of "inscription" */
	["inscription"]: AliasType<{
		chain_id?: boolean | `@${string}`,
		content_hash?: boolean | `@${string}`,
		content_path?: boolean | `@${string}`,
		content_size_bytes?: boolean | `@${string}`,
		creator?: boolean | `@${string}`,
		current_owner?: boolean | `@${string}`,
		date_created?: boolean | `@${string}`,
		height?: boolean | `@${string}`,
		id?: boolean | `@${string}`,
		metadata?: [{	/** JSON select path */
			path?: string | undefined | null
		}, boolean | `@${string}`],
		transaction_hash?: boolean | `@${string}`,
		type?: boolean | `@${string}`,
		version?: boolean | `@${string}`,
		__typename?: boolean | `@${string}`
	}>;
	/** Boolean expression to filter rows from the table "inscription". All fields are combined with a logical 'AND'. */
	["inscription_bool_exp"]: {
		_and?: Array<ResolverInputTypes["inscription_bool_exp"]> | undefined | null,
		_not?: ResolverInputTypes["inscription_bool_exp"] | undefined | null,
		_or?: Array<ResolverInputTypes["inscription_bool_exp"]> | undefined | null,
		chain_id?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		content_hash?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		content_path?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		content_size_bytes?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		creator?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		current_owner?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		date_created?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
		height?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		metadata?: ResolverInputTypes["json_comparison_exp"] | undefined | null,
		transaction_hash?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		type?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		version?: ResolverInputTypes["String_comparison_exp"] | undefined | null
	};
	/** Ordering options when selecting data from "inscription". */
	["inscription_order_by"]: {
		chain_id?: ResolverInputTypes["order_by"] | undefined | null,
		content_hash?: ResolverInputTypes["order_by"] | undefined | null,
		content_path?: ResolverInputTypes["order_by"] | undefined | null,
		content_size_bytes?: ResolverInputTypes["order_by"] | undefined | null,
		creator?: ResolverInputTypes["order_by"] | undefined | null,
		current_owner?: ResolverInputTypes["order_by"] | undefined | null,
		date_created?: ResolverInputTypes["order_by"] | undefined | null,
		height?: ResolverInputTypes["order_by"] | undefined | null,
		id?: ResolverInputTypes["order_by"] | undefined | null,
		metadata?: ResolverInputTypes["order_by"] | undefined | null,
		transaction_hash?: ResolverInputTypes["order_by"] | undefined | null,
		type?: ResolverInputTypes["order_by"] | undefined | null,
		version?: ResolverInputTypes["order_by"] | undefined | null
	};
	/** select columns of table "inscription" */
	["inscription_select_column"]: inscription_select_column;
	/** Streaming cursor of the table "inscription" */
	["inscription_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ResolverInputTypes["inscription_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
	};
	/** Initial value of the column from where the streaming should start */
	["inscription_stream_cursor_value_input"]: {
		chain_id?: string | undefined | null,
		content_hash?: string | undefined | null,
		content_path?: string | undefined | null,
		content_size_bytes?: number | undefined | null,
		creator?: string | undefined | null,
		current_owner?: string | undefined | null,
		date_created?: ResolverInputTypes["timestamp"] | undefined | null,
		height?: number | undefined | null,
		id?: number | undefined | null,
		metadata?: ResolverInputTypes["json"] | undefined | null,
		transaction_hash?: string | undefined | null,
		type?: string | undefined | null,
		version?: string | undefined | null
	};
	["json"]: unknown;
	/** Boolean expression to compare columns of type "json". All fields are combined with logical 'AND'. */
	["json_comparison_exp"]: {
		_eq?: ResolverInputTypes["json"] | undefined | null,
		_gt?: ResolverInputTypes["json"] | undefined | null,
		_gte?: ResolverInputTypes["json"] | undefined | null,
		_in?: Array<ResolverInputTypes["json"]> | undefined | null,
		_is_null?: boolean | undefined | null,
		_lt?: ResolverInputTypes["json"] | undefined | null,
		_lte?: ResolverInputTypes["json"] | undefined | null,
		_neq?: ResolverInputTypes["json"] | undefined | null,
		_nin?: Array<ResolverInputTypes["json"]> | undefined | null
	};
	/** column ordering options */
	["order_by"]: order_by;
	["query_root"]: AliasType<{
		inscription?: [{	/** distinct select on columns */
			distinct_on?: Array<ResolverInputTypes["inscription_select_column"]> | undefined | null,	/** limit the number of rows returned */
			limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null,	/** sort the rows by one or more columns */
			order_by?: Array<ResolverInputTypes["inscription_order_by"]> | undefined | null,	/** filter the rows returned */
			where?: ResolverInputTypes["inscription_bool_exp"] | undefined | null
		}, ResolverInputTypes["inscription"]],
		inscription_by_pk?: [{ id: number }, ResolverInputTypes["inscription"]],
		status?: [{	/** distinct select on columns */
			distinct_on?: Array<ResolverInputTypes["status_select_column"]> | undefined | null,	/** limit the number of rows returned */
			limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null,	/** sort the rows by one or more columns */
			order_by?: Array<ResolverInputTypes["status_order_by"]> | undefined | null,	/** filter the rows returned */
			where?: ResolverInputTypes["status_bool_exp"] | undefined | null
		}, ResolverInputTypes["status"]],
		status_by_pk?: [{ id: number }, ResolverInputTypes["status"]],
		token?: [{	/** distinct select on columns */
			distinct_on?: Array<ResolverInputTypes["token_select_column"]> | undefined | null,	/** limit the number of rows returned */
			limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null,	/** sort the rows by one or more columns */
			order_by?: Array<ResolverInputTypes["token_order_by"]> | undefined | null,	/** filter the rows returned */
			where?: ResolverInputTypes["token_bool_exp"] | undefined | null
		}, ResolverInputTypes["token"]],
		token_by_pk?: [{ id: number }, ResolverInputTypes["token"]],
		transaction?: [{	/** distinct select on columns */
			distinct_on?: Array<ResolverInputTypes["transaction_select_column"]> | undefined | null,	/** limit the number of rows returned */
			limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null,	/** sort the rows by one or more columns */
			order_by?: Array<ResolverInputTypes["transaction_order_by"]> | undefined | null,	/** filter the rows returned */
			where?: ResolverInputTypes["transaction_bool_exp"] | undefined | null
		}, ResolverInputTypes["transaction"]],
		transaction_by_pk?: [{ id: number }, ResolverInputTypes["transaction"]],
		__typename?: boolean | `@${string}`
	}>;
	["smallint"]: unknown;
	/** Boolean expression to compare columns of type "smallint". All fields are combined with logical 'AND'. */
	["smallint_comparison_exp"]: {
		_eq?: ResolverInputTypes["smallint"] | undefined | null,
		_gt?: ResolverInputTypes["smallint"] | undefined | null,
		_gte?: ResolverInputTypes["smallint"] | undefined | null,
		_in?: Array<ResolverInputTypes["smallint"]> | undefined | null,
		_is_null?: boolean | undefined | null,
		_lt?: ResolverInputTypes["smallint"] | undefined | null,
		_lte?: ResolverInputTypes["smallint"] | undefined | null,
		_neq?: ResolverInputTypes["smallint"] | undefined | null,
		_nin?: Array<ResolverInputTypes["smallint"]> | undefined | null
	};
	/** columns and relationships of "status" */
	["status"]: AliasType<{
		chain_id?: boolean | `@${string}`,
		date_updated?: boolean | `@${string}`,
		id?: boolean | `@${string}`,
		last_processed_height?: boolean | `@${string}`,
		__typename?: boolean | `@${string}`
	}>;
	/** Boolean expression to filter rows from the table "status". All fields are combined with a logical 'AND'. */
	["status_bool_exp"]: {
		_and?: Array<ResolverInputTypes["status_bool_exp"]> | undefined | null,
		_not?: ResolverInputTypes["status_bool_exp"] | undefined | null,
		_or?: Array<ResolverInputTypes["status_bool_exp"]> | undefined | null,
		chain_id?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		date_updated?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
		id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		last_processed_height?: ResolverInputTypes["Int_comparison_exp"] | undefined | null
	};
	/** Ordering options when selecting data from "status". */
	["status_order_by"]: {
		chain_id?: ResolverInputTypes["order_by"] | undefined | null,
		date_updated?: ResolverInputTypes["order_by"] | undefined | null,
		id?: ResolverInputTypes["order_by"] | undefined | null,
		last_processed_height?: ResolverInputTypes["order_by"] | undefined | null
	};
	/** select columns of table "status" */
	["status_select_column"]: status_select_column;
	/** Streaming cursor of the table "status" */
	["status_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ResolverInputTypes["status_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
	};
	/** Initial value of the column from where the streaming should start */
	["status_stream_cursor_value_input"]: {
		chain_id?: string | undefined | null,
		date_updated?: ResolverInputTypes["timestamp"] | undefined | null,
		id?: number | undefined | null,
		last_processed_height?: number | undefined | null
	};
	["subscription_root"]: AliasType<{
		inscription?: [{	/** distinct select on columns */
			distinct_on?: Array<ResolverInputTypes["inscription_select_column"]> | undefined | null,	/** limit the number of rows returned */
			limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null,	/** sort the rows by one or more columns */
			order_by?: Array<ResolverInputTypes["inscription_order_by"]> | undefined | null,	/** filter the rows returned */
			where?: ResolverInputTypes["inscription_bool_exp"] | undefined | null
		}, ResolverInputTypes["inscription"]],
		inscription_by_pk?: [{ id: number }, ResolverInputTypes["inscription"]],
		inscription_stream?: [{	/** maximum number of rows returned in a single batch */
			batch_size: number,	/** cursor to stream the results returned by the query */
			cursor: Array<ResolverInputTypes["inscription_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
			where?: ResolverInputTypes["inscription_bool_exp"] | undefined | null
		}, ResolverInputTypes["inscription"]],
		status?: [{	/** distinct select on columns */
			distinct_on?: Array<ResolverInputTypes["status_select_column"]> | undefined | null,	/** limit the number of rows returned */
			limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null,	/** sort the rows by one or more columns */
			order_by?: Array<ResolverInputTypes["status_order_by"]> | undefined | null,	/** filter the rows returned */
			where?: ResolverInputTypes["status_bool_exp"] | undefined | null
		}, ResolverInputTypes["status"]],
		status_by_pk?: [{ id: number }, ResolverInputTypes["status"]],
		status_stream?: [{	/** maximum number of rows returned in a single batch */
			batch_size: number,	/** cursor to stream the results returned by the query */
			cursor: Array<ResolverInputTypes["status_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
			where?: ResolverInputTypes["status_bool_exp"] | undefined | null
		}, ResolverInputTypes["status"]],
		token?: [{	/** distinct select on columns */
			distinct_on?: Array<ResolverInputTypes["token_select_column"]> | undefined | null,	/** limit the number of rows returned */
			limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null,	/** sort the rows by one or more columns */
			order_by?: Array<ResolverInputTypes["token_order_by"]> | undefined | null,	/** filter the rows returned */
			where?: ResolverInputTypes["token_bool_exp"] | undefined | null
		}, ResolverInputTypes["token"]],
		token_by_pk?: [{ id: number }, ResolverInputTypes["token"]],
		token_stream?: [{	/** maximum number of rows returned in a single batch */
			batch_size: number,	/** cursor to stream the results returned by the query */
			cursor: Array<ResolverInputTypes["token_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
			where?: ResolverInputTypes["token_bool_exp"] | undefined | null
		}, ResolverInputTypes["token"]],
		transaction?: [{	/** distinct select on columns */
			distinct_on?: Array<ResolverInputTypes["transaction_select_column"]> | undefined | null,	/** limit the number of rows returned */
			limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
			offset?: number | undefined | null,	/** sort the rows by one or more columns */
			order_by?: Array<ResolverInputTypes["transaction_order_by"]> | undefined | null,	/** filter the rows returned */
			where?: ResolverInputTypes["transaction_bool_exp"] | undefined | null
		}, ResolverInputTypes["transaction"]],
		transaction_by_pk?: [{ id: number }, ResolverInputTypes["transaction"]],
		transaction_stream?: [{	/** maximum number of rows returned in a single batch */
			batch_size: number,	/** cursor to stream the results returned by the query */
			cursor: Array<ResolverInputTypes["transaction_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
			where?: ResolverInputTypes["transaction_bool_exp"] | undefined | null
		}, ResolverInputTypes["transaction"]],
		__typename?: boolean | `@${string}`
	}>;
	["timestamp"]: unknown;
	/** Boolean expression to compare columns of type "timestamp". All fields are combined with logical 'AND'. */
	["timestamp_comparison_exp"]: {
		_eq?: ResolverInputTypes["timestamp"] | undefined | null,
		_gt?: ResolverInputTypes["timestamp"] | undefined | null,
		_gte?: ResolverInputTypes["timestamp"] | undefined | null,
		_in?: Array<ResolverInputTypes["timestamp"]> | undefined | null,
		_is_null?: boolean | undefined | null,
		_lt?: ResolverInputTypes["timestamp"] | undefined | null,
		_lte?: ResolverInputTypes["timestamp"] | undefined | null,
		_neq?: ResolverInputTypes["timestamp"] | undefined | null,
		_nin?: Array<ResolverInputTypes["timestamp"]> | undefined | null
	};
	/** columns and relationships of "token" */
	["token"]: AliasType<{
		chain_id?: boolean | `@${string}`,
		content_path?: boolean | `@${string}`,
		content_size_bytes?: boolean | `@${string}`,
		creator?: boolean | `@${string}`,
		current_owner?: boolean | `@${string}`,
		date_created?: boolean | `@${string}`,
		decimals?: boolean | `@${string}`,
		height?: boolean | `@${string}`,
		id?: boolean | `@${string}`,
		launch_timestamp?: boolean | `@${string}`,
		max_supply?: boolean | `@${string}`,
		metadata?: boolean | `@${string}`,
		mint_page?: boolean | `@${string}`,
		name?: boolean | `@${string}`,
		per_wallet_limit?: boolean | `@${string}`,
		ticker?: boolean | `@${string}`,
		transaction_hash?: boolean | `@${string}`,
		version?: boolean | `@${string}`,
		__typename?: boolean | `@${string}`
	}>;
	/** Boolean expression to filter rows from the table "token". All fields are combined with a logical 'AND'. */
	["token_bool_exp"]: {
		_and?: Array<ResolverInputTypes["token_bool_exp"]> | undefined | null,
		_not?: ResolverInputTypes["token_bool_exp"] | undefined | null,
		_or?: Array<ResolverInputTypes["token_bool_exp"]> | undefined | null,
		chain_id?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		content_path?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		content_size_bytes?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		creator?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		current_owner?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		date_created?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
		decimals?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
		height?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		launch_timestamp?: ResolverInputTypes["bigint_comparison_exp"] | undefined | null,
		max_supply?: ResolverInputTypes["bigint_comparison_exp"] | undefined | null,
		metadata?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		mint_page?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		name?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		per_wallet_limit?: ResolverInputTypes["bigint_comparison_exp"] | undefined | null,
		ticker?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		transaction_hash?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		version?: ResolverInputTypes["String_comparison_exp"] | undefined | null
	};
	/** Ordering options when selecting data from "token". */
	["token_order_by"]: {
		chain_id?: ResolverInputTypes["order_by"] | undefined | null,
		content_path?: ResolverInputTypes["order_by"] | undefined | null,
		content_size_bytes?: ResolverInputTypes["order_by"] | undefined | null,
		creator?: ResolverInputTypes["order_by"] | undefined | null,
		current_owner?: ResolverInputTypes["order_by"] | undefined | null,
		date_created?: ResolverInputTypes["order_by"] | undefined | null,
		decimals?: ResolverInputTypes["order_by"] | undefined | null,
		height?: ResolverInputTypes["order_by"] | undefined | null,
		id?: ResolverInputTypes["order_by"] | undefined | null,
		launch_timestamp?: ResolverInputTypes["order_by"] | undefined | null,
		max_supply?: ResolverInputTypes["order_by"] | undefined | null,
		metadata?: ResolverInputTypes["order_by"] | undefined | null,
		mint_page?: ResolverInputTypes["order_by"] | undefined | null,
		name?: ResolverInputTypes["order_by"] | undefined | null,
		per_wallet_limit?: ResolverInputTypes["order_by"] | undefined | null,
		ticker?: ResolverInputTypes["order_by"] | undefined | null,
		transaction_hash?: ResolverInputTypes["order_by"] | undefined | null,
		version?: ResolverInputTypes["order_by"] | undefined | null
	};
	/** select columns of table "token" */
	["token_select_column"]: token_select_column;
	/** Streaming cursor of the table "token" */
	["token_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ResolverInputTypes["token_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
	};
	/** Initial value of the column from where the streaming should start */
	["token_stream_cursor_value_input"]: {
		chain_id?: string | undefined | null,
		content_path?: string | undefined | null,
		content_size_bytes?: number | undefined | null,
		creator?: string | undefined | null,
		current_owner?: string | undefined | null,
		date_created?: ResolverInputTypes["timestamp"] | undefined | null,
		decimals?: ResolverInputTypes["smallint"] | undefined | null,
		height?: number | undefined | null,
		id?: number | undefined | null,
		launch_timestamp?: ResolverInputTypes["bigint"] | undefined | null,
		max_supply?: ResolverInputTypes["bigint"] | undefined | null,
		metadata?: string | undefined | null,
		mint_page?: string | undefined | null,
		name?: string | undefined | null,
		per_wallet_limit?: ResolverInputTypes["bigint"] | undefined | null,
		ticker?: string | undefined | null,
		transaction_hash?: string | undefined | null,
		version?: string | undefined | null
	};
	/** columns and relationships of "transaction" */
	["transaction"]: AliasType<{
		content?: boolean | `@${string}`,
		content_length?: boolean | `@${string}`,
		date_created?: boolean | `@${string}`,
		fees?: boolean | `@${string}`,
		gas_used?: boolean | `@${string}`,
		hash?: boolean | `@${string}`,
		height?: boolean | `@${string}`,
		id?: boolean | `@${string}`,
		status_message?: boolean | `@${string}`,
		__typename?: boolean | `@${string}`
	}>;
	/** Boolean expression to filter rows from the table "transaction". All fields are combined with a logical 'AND'. */
	["transaction_bool_exp"]: {
		_and?: Array<ResolverInputTypes["transaction_bool_exp"]> | undefined | null,
		_not?: ResolverInputTypes["transaction_bool_exp"] | undefined | null,
		_or?: Array<ResolverInputTypes["transaction_bool_exp"]> | undefined | null,
		content?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		content_length?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		date_created?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
		fees?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		gas_used?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		hash?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
		height?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
		status_message?: ResolverInputTypes["String_comparison_exp"] | undefined | null
	};
	/** Ordering options when selecting data from "transaction". */
	["transaction_order_by"]: {
		content?: ResolverInputTypes["order_by"] | undefined | null,
		content_length?: ResolverInputTypes["order_by"] | undefined | null,
		date_created?: ResolverInputTypes["order_by"] | undefined | null,
		fees?: ResolverInputTypes["order_by"] | undefined | null,
		gas_used?: ResolverInputTypes["order_by"] | undefined | null,
		hash?: ResolverInputTypes["order_by"] | undefined | null,
		height?: ResolverInputTypes["order_by"] | undefined | null,
		id?: ResolverInputTypes["order_by"] | undefined | null,
		status_message?: ResolverInputTypes["order_by"] | undefined | null
	};
	/** select columns of table "transaction" */
	["transaction_select_column"]: transaction_select_column;
	/** Streaming cursor of the table "transaction" */
	["transaction_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ResolverInputTypes["transaction_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
	};
	/** Initial value of the column from where the streaming should start */
	["transaction_stream_cursor_value_input"]: {
		content?: string | undefined | null,
		content_length?: number | undefined | null,
		date_created?: ResolverInputTypes["timestamp"] | undefined | null,
		fees?: string | undefined | null,
		gas_used?: number | undefined | null,
		hash?: string | undefined | null,
		height?: number | undefined | null,
		id?: number | undefined | null,
		status_message?: string | undefined | null
	}
}

export type ModelTypes = {
	["schema"]: {
		query?: ModelTypes["query_root"] | undefined,
		subscription?: ModelTypes["subscription_root"] | undefined
	};
	/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
	["Int_comparison_exp"]: {
		_eq?: number | undefined,
		_gt?: number | undefined,
		_gte?: number | undefined,
		_in?: Array<number> | undefined,
		_is_null?: boolean | undefined,
		_lt?: number | undefined,
		_lte?: number | undefined,
		_neq?: number | undefined,
		_nin?: Array<number> | undefined
	};
	/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
	["String_comparison_exp"]: {
		_eq?: string | undefined,
		_gt?: string | undefined,
		_gte?: string | undefined,
		/** does the column match the given case-insensitive pattern */
		_ilike?: string | undefined,
		_in?: Array<string> | undefined,
		/** does the column match the given POSIX regular expression, case insensitive */
		_iregex?: string | undefined,
		_is_null?: boolean | undefined,
		/** does the column match the given pattern */
		_like?: string | undefined,
		_lt?: string | undefined,
		_lte?: string | undefined,
		_neq?: string | undefined,
		/** does the column NOT match the given case-insensitive pattern */
		_nilike?: string | undefined,
		_nin?: Array<string> | undefined,
		/** does the column NOT match the given POSIX regular expression, case insensitive */
		_niregex?: string | undefined,
		/** does the column NOT match the given pattern */
		_nlike?: string | undefined,
		/** does the column NOT match the given POSIX regular expression, case sensitive */
		_nregex?: string | undefined,
		/** does the column NOT match the given SQL regular expression */
		_nsimilar?: string | undefined,
		/** does the column match the given POSIX regular expression, case sensitive */
		_regex?: string | undefined,
		/** does the column match the given SQL regular expression */
		_similar?: string | undefined
	};
	["bigint"]: any;
	/** Boolean expression to compare columns of type "bigint". All fields are combined with logical 'AND'. */
	["bigint_comparison_exp"]: {
		_eq?: ModelTypes["bigint"] | undefined,
		_gt?: ModelTypes["bigint"] | undefined,
		_gte?: ModelTypes["bigint"] | undefined,
		_in?: Array<ModelTypes["bigint"]> | undefined,
		_is_null?: boolean | undefined,
		_lt?: ModelTypes["bigint"] | undefined,
		_lte?: ModelTypes["bigint"] | undefined,
		_neq?: ModelTypes["bigint"] | undefined,
		_nin?: Array<ModelTypes["bigint"]> | undefined
	};
	["cursor_ordering"]: cursor_ordering;
	/** columns and relationships of "inscription" */
	["inscription"]: {
		chain_id: string,
		content_hash: string,
		content_path: string,
		content_size_bytes: number,
		creator: string,
		current_owner: string,
		date_created: ModelTypes["timestamp"],
		height: number,
		id: number,
		metadata: ModelTypes["json"],
		transaction_hash: string,
		type: string,
		version: string
	};
	/** Boolean expression to filter rows from the table "inscription". All fields are combined with a logical 'AND'. */
	["inscription_bool_exp"]: {
		_and?: Array<ModelTypes["inscription_bool_exp"]> | undefined,
		_not?: ModelTypes["inscription_bool_exp"] | undefined,
		_or?: Array<ModelTypes["inscription_bool_exp"]> | undefined,
		chain_id?: ModelTypes["String_comparison_exp"] | undefined,
		content_hash?: ModelTypes["String_comparison_exp"] | undefined,
		content_path?: ModelTypes["String_comparison_exp"] | undefined,
		content_size_bytes?: ModelTypes["Int_comparison_exp"] | undefined,
		creator?: ModelTypes["String_comparison_exp"] | undefined,
		current_owner?: ModelTypes["String_comparison_exp"] | undefined,
		date_created?: ModelTypes["timestamp_comparison_exp"] | undefined,
		height?: ModelTypes["Int_comparison_exp"] | undefined,
		id?: ModelTypes["Int_comparison_exp"] | undefined,
		metadata?: ModelTypes["json_comparison_exp"] | undefined,
		transaction_hash?: ModelTypes["String_comparison_exp"] | undefined,
		type?: ModelTypes["String_comparison_exp"] | undefined,
		version?: ModelTypes["String_comparison_exp"] | undefined
	};
	/** Ordering options when selecting data from "inscription". */
	["inscription_order_by"]: {
		chain_id?: ModelTypes["order_by"] | undefined,
		content_hash?: ModelTypes["order_by"] | undefined,
		content_path?: ModelTypes["order_by"] | undefined,
		content_size_bytes?: ModelTypes["order_by"] | undefined,
		creator?: ModelTypes["order_by"] | undefined,
		current_owner?: ModelTypes["order_by"] | undefined,
		date_created?: ModelTypes["order_by"] | undefined,
		height?: ModelTypes["order_by"] | undefined,
		id?: ModelTypes["order_by"] | undefined,
		metadata?: ModelTypes["order_by"] | undefined,
		transaction_hash?: ModelTypes["order_by"] | undefined,
		type?: ModelTypes["order_by"] | undefined,
		version?: ModelTypes["order_by"] | undefined
	};
	["inscription_select_column"]: inscription_select_column;
	/** Streaming cursor of the table "inscription" */
	["inscription_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ModelTypes["inscription_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: ModelTypes["cursor_ordering"] | undefined
	};
	/** Initial value of the column from where the streaming should start */
	["inscription_stream_cursor_value_input"]: {
		chain_id?: string | undefined,
		content_hash?: string | undefined,
		content_path?: string | undefined,
		content_size_bytes?: number | undefined,
		creator?: string | undefined,
		current_owner?: string | undefined,
		date_created?: ModelTypes["timestamp"] | undefined,
		height?: number | undefined,
		id?: number | undefined,
		metadata?: ModelTypes["json"] | undefined,
		transaction_hash?: string | undefined,
		type?: string | undefined,
		version?: string | undefined
	};
	["json"]: any;
	/** Boolean expression to compare columns of type "json". All fields are combined with logical 'AND'. */
	["json_comparison_exp"]: {
		_eq?: ModelTypes["json"] | undefined,
		_gt?: ModelTypes["json"] | undefined,
		_gte?: ModelTypes["json"] | undefined,
		_in?: Array<ModelTypes["json"]> | undefined,
		_is_null?: boolean | undefined,
		_lt?: ModelTypes["json"] | undefined,
		_lte?: ModelTypes["json"] | undefined,
		_neq?: ModelTypes["json"] | undefined,
		_nin?: Array<ModelTypes["json"]> | undefined
	};
	["order_by"]: order_by;
	["query_root"]: {
		/** fetch data from the table: "inscription" */
		inscription: Array<ModelTypes["inscription"]>,
		/** fetch data from the table: "inscription" using primary key columns */
		inscription_by_pk?: ModelTypes["inscription"] | undefined,
		/** fetch data from the table: "status" */
		status: Array<ModelTypes["status"]>,
		/** fetch data from the table: "status" using primary key columns */
		status_by_pk?: ModelTypes["status"] | undefined,
		/** fetch data from the table: "token" */
		token: Array<ModelTypes["token"]>,
		/** fetch data from the table: "token" using primary key columns */
		token_by_pk?: ModelTypes["token"] | undefined,
		/** fetch data from the table: "transaction" */
		transaction: Array<ModelTypes["transaction"]>,
		/** fetch data from the table: "transaction" using primary key columns */
		transaction_by_pk?: ModelTypes["transaction"] | undefined
	};
	["smallint"]: any;
	/** Boolean expression to compare columns of type "smallint". All fields are combined with logical 'AND'. */
	["smallint_comparison_exp"]: {
		_eq?: ModelTypes["smallint"] | undefined,
		_gt?: ModelTypes["smallint"] | undefined,
		_gte?: ModelTypes["smallint"] | undefined,
		_in?: Array<ModelTypes["smallint"]> | undefined,
		_is_null?: boolean | undefined,
		_lt?: ModelTypes["smallint"] | undefined,
		_lte?: ModelTypes["smallint"] | undefined,
		_neq?: ModelTypes["smallint"] | undefined,
		_nin?: Array<ModelTypes["smallint"]> | undefined
	};
	/** columns and relationships of "status" */
	["status"]: {
		chain_id: string,
		date_updated: ModelTypes["timestamp"],
		id: number,
		last_processed_height: number
	};
	/** Boolean expression to filter rows from the table "status". All fields are combined with a logical 'AND'. */
	["status_bool_exp"]: {
		_and?: Array<ModelTypes["status_bool_exp"]> | undefined,
		_not?: ModelTypes["status_bool_exp"] | undefined,
		_or?: Array<ModelTypes["status_bool_exp"]> | undefined,
		chain_id?: ModelTypes["String_comparison_exp"] | undefined,
		date_updated?: ModelTypes["timestamp_comparison_exp"] | undefined,
		id?: ModelTypes["Int_comparison_exp"] | undefined,
		last_processed_height?: ModelTypes["Int_comparison_exp"] | undefined
	};
	/** Ordering options when selecting data from "status". */
	["status_order_by"]: {
		chain_id?: ModelTypes["order_by"] | undefined,
		date_updated?: ModelTypes["order_by"] | undefined,
		id?: ModelTypes["order_by"] | undefined,
		last_processed_height?: ModelTypes["order_by"] | undefined
	};
	["status_select_column"]: status_select_column;
	/** Streaming cursor of the table "status" */
	["status_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ModelTypes["status_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: ModelTypes["cursor_ordering"] | undefined
	};
	/** Initial value of the column from where the streaming should start */
	["status_stream_cursor_value_input"]: {
		chain_id?: string | undefined,
		date_updated?: ModelTypes["timestamp"] | undefined,
		id?: number | undefined,
		last_processed_height?: number | undefined
	};
	["subscription_root"]: {
		/** fetch data from the table: "inscription" */
		inscription: Array<ModelTypes["inscription"]>,
		/** fetch data from the table: "inscription" using primary key columns */
		inscription_by_pk?: ModelTypes["inscription"] | undefined,
		/** fetch data from the table in a streaming manner: "inscription" */
		inscription_stream: Array<ModelTypes["inscription"]>,
		/** fetch data from the table: "status" */
		status: Array<ModelTypes["status"]>,
		/** fetch data from the table: "status" using primary key columns */
		status_by_pk?: ModelTypes["status"] | undefined,
		/** fetch data from the table in a streaming manner: "status" */
		status_stream: Array<ModelTypes["status"]>,
		/** fetch data from the table: "token" */
		token: Array<ModelTypes["token"]>,
		/** fetch data from the table: "token" using primary key columns */
		token_by_pk?: ModelTypes["token"] | undefined,
		/** fetch data from the table in a streaming manner: "token" */
		token_stream: Array<ModelTypes["token"]>,
		/** fetch data from the table: "transaction" */
		transaction: Array<ModelTypes["transaction"]>,
		/** fetch data from the table: "transaction" using primary key columns */
		transaction_by_pk?: ModelTypes["transaction"] | undefined,
		/** fetch data from the table in a streaming manner: "transaction" */
		transaction_stream: Array<ModelTypes["transaction"]>
	};
	["timestamp"]: any;
	/** Boolean expression to compare columns of type "timestamp". All fields are combined with logical 'AND'. */
	["timestamp_comparison_exp"]: {
		_eq?: ModelTypes["timestamp"] | undefined,
		_gt?: ModelTypes["timestamp"] | undefined,
		_gte?: ModelTypes["timestamp"] | undefined,
		_in?: Array<ModelTypes["timestamp"]> | undefined,
		_is_null?: boolean | undefined,
		_lt?: ModelTypes["timestamp"] | undefined,
		_lte?: ModelTypes["timestamp"] | undefined,
		_neq?: ModelTypes["timestamp"] | undefined,
		_nin?: Array<ModelTypes["timestamp"]> | undefined
	};
	/** columns and relationships of "token" */
	["token"]: {
		chain_id: string,
		content_path?: string | undefined,
		content_size_bytes?: number | undefined,
		creator: string,
		current_owner: string,
		date_created: ModelTypes["timestamp"],
		decimals: ModelTypes["smallint"],
		height: number,
		id: number,
		launch_timestamp: ModelTypes["bigint"],
		max_supply: ModelTypes["bigint"],
		metadata?: string | undefined,
		mint_page: string,
		name: string,
		per_wallet_limit: ModelTypes["bigint"],
		ticker: string,
		transaction_hash: string,
		version: string
	};
	/** Boolean expression to filter rows from the table "token". All fields are combined with a logical 'AND'. */
	["token_bool_exp"]: {
		_and?: Array<ModelTypes["token_bool_exp"]> | undefined,
		_not?: ModelTypes["token_bool_exp"] | undefined,
		_or?: Array<ModelTypes["token_bool_exp"]> | undefined,
		chain_id?: ModelTypes["String_comparison_exp"] | undefined,
		content_path?: ModelTypes["String_comparison_exp"] | undefined,
		content_size_bytes?: ModelTypes["Int_comparison_exp"] | undefined,
		creator?: ModelTypes["String_comparison_exp"] | undefined,
		current_owner?: ModelTypes["String_comparison_exp"] | undefined,
		date_created?: ModelTypes["timestamp_comparison_exp"] | undefined,
		decimals?: ModelTypes["smallint_comparison_exp"] | undefined,
		height?: ModelTypes["Int_comparison_exp"] | undefined,
		id?: ModelTypes["Int_comparison_exp"] | undefined,
		launch_timestamp?: ModelTypes["bigint_comparison_exp"] | undefined,
		max_supply?: ModelTypes["bigint_comparison_exp"] | undefined,
		metadata?: ModelTypes["String_comparison_exp"] | undefined,
		mint_page?: ModelTypes["String_comparison_exp"] | undefined,
		name?: ModelTypes["String_comparison_exp"] | undefined,
		per_wallet_limit?: ModelTypes["bigint_comparison_exp"] | undefined,
		ticker?: ModelTypes["String_comparison_exp"] | undefined,
		transaction_hash?: ModelTypes["String_comparison_exp"] | undefined,
		version?: ModelTypes["String_comparison_exp"] | undefined
	};
	/** Ordering options when selecting data from "token". */
	["token_order_by"]: {
		chain_id?: ModelTypes["order_by"] | undefined,
		content_path?: ModelTypes["order_by"] | undefined,
		content_size_bytes?: ModelTypes["order_by"] | undefined,
		creator?: ModelTypes["order_by"] | undefined,
		current_owner?: ModelTypes["order_by"] | undefined,
		date_created?: ModelTypes["order_by"] | undefined,
		decimals?: ModelTypes["order_by"] | undefined,
		height?: ModelTypes["order_by"] | undefined,
		id?: ModelTypes["order_by"] | undefined,
		launch_timestamp?: ModelTypes["order_by"] | undefined,
		max_supply?: ModelTypes["order_by"] | undefined,
		metadata?: ModelTypes["order_by"] | undefined,
		mint_page?: ModelTypes["order_by"] | undefined,
		name?: ModelTypes["order_by"] | undefined,
		per_wallet_limit?: ModelTypes["order_by"] | undefined,
		ticker?: ModelTypes["order_by"] | undefined,
		transaction_hash?: ModelTypes["order_by"] | undefined,
		version?: ModelTypes["order_by"] | undefined
	};
	["token_select_column"]: token_select_column;
	/** Streaming cursor of the table "token" */
	["token_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ModelTypes["token_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: ModelTypes["cursor_ordering"] | undefined
	};
	/** Initial value of the column from where the streaming should start */
	["token_stream_cursor_value_input"]: {
		chain_id?: string | undefined,
		content_path?: string | undefined,
		content_size_bytes?: number | undefined,
		creator?: string | undefined,
		current_owner?: string | undefined,
		date_created?: ModelTypes["timestamp"] | undefined,
		decimals?: ModelTypes["smallint"] | undefined,
		height?: number | undefined,
		id?: number | undefined,
		launch_timestamp?: ModelTypes["bigint"] | undefined,
		max_supply?: ModelTypes["bigint"] | undefined,
		metadata?: string | undefined,
		mint_page?: string | undefined,
		name?: string | undefined,
		per_wallet_limit?: ModelTypes["bigint"] | undefined,
		ticker?: string | undefined,
		transaction_hash?: string | undefined,
		version?: string | undefined
	};
	/** columns and relationships of "transaction" */
	["transaction"]: {
		content: string,
		content_length: number,
		date_created: ModelTypes["timestamp"],
		fees: string,
		gas_used: number,
		hash: string,
		height: number,
		id: number,
		status_message?: string | undefined
	};
	/** Boolean expression to filter rows from the table "transaction". All fields are combined with a logical 'AND'. */
	["transaction_bool_exp"]: {
		_and?: Array<ModelTypes["transaction_bool_exp"]> | undefined,
		_not?: ModelTypes["transaction_bool_exp"] | undefined,
		_or?: Array<ModelTypes["transaction_bool_exp"]> | undefined,
		content?: ModelTypes["String_comparison_exp"] | undefined,
		content_length?: ModelTypes["Int_comparison_exp"] | undefined,
		date_created?: ModelTypes["timestamp_comparison_exp"] | undefined,
		fees?: ModelTypes["String_comparison_exp"] | undefined,
		gas_used?: ModelTypes["Int_comparison_exp"] | undefined,
		hash?: ModelTypes["String_comparison_exp"] | undefined,
		height?: ModelTypes["Int_comparison_exp"] | undefined,
		id?: ModelTypes["Int_comparison_exp"] | undefined,
		status_message?: ModelTypes["String_comparison_exp"] | undefined
	};
	/** Ordering options when selecting data from "transaction". */
	["transaction_order_by"]: {
		content?: ModelTypes["order_by"] | undefined,
		content_length?: ModelTypes["order_by"] | undefined,
		date_created?: ModelTypes["order_by"] | undefined,
		fees?: ModelTypes["order_by"] | undefined,
		gas_used?: ModelTypes["order_by"] | undefined,
		hash?: ModelTypes["order_by"] | undefined,
		height?: ModelTypes["order_by"] | undefined,
		id?: ModelTypes["order_by"] | undefined,
		status_message?: ModelTypes["order_by"] | undefined
	};
	["transaction_select_column"]: transaction_select_column;
	/** Streaming cursor of the table "transaction" */
	["transaction_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: ModelTypes["transaction_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: ModelTypes["cursor_ordering"] | undefined
	};
	/** Initial value of the column from where the streaming should start */
	["transaction_stream_cursor_value_input"]: {
		content?: string | undefined,
		content_length?: number | undefined,
		date_created?: ModelTypes["timestamp"] | undefined,
		fees?: string | undefined,
		gas_used?: number | undefined,
		hash?: string | undefined,
		height?: number | undefined,
		id?: number | undefined,
		status_message?: string | undefined
	}
}

export type GraphQLTypes = {
	/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
	["Int_comparison_exp"]: {
		_eq?: number | undefined,
		_gt?: number | undefined,
		_gte?: number | undefined,
		_in?: Array<number> | undefined,
		_is_null?: boolean | undefined,
		_lt?: number | undefined,
		_lte?: number | undefined,
		_neq?: number | undefined,
		_nin?: Array<number> | undefined
	};
	/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
	["String_comparison_exp"]: {
		_eq?: string | undefined,
		_gt?: string | undefined,
		_gte?: string | undefined,
		/** does the column match the given case-insensitive pattern */
		_ilike?: string | undefined,
		_in?: Array<string> | undefined,
		/** does the column match the given POSIX regular expression, case insensitive */
		_iregex?: string | undefined,
		_is_null?: boolean | undefined,
		/** does the column match the given pattern */
		_like?: string | undefined,
		_lt?: string | undefined,
		_lte?: string | undefined,
		_neq?: string | undefined,
		/** does the column NOT match the given case-insensitive pattern */
		_nilike?: string | undefined,
		_nin?: Array<string> | undefined,
		/** does the column NOT match the given POSIX regular expression, case insensitive */
		_niregex?: string | undefined,
		/** does the column NOT match the given pattern */
		_nlike?: string | undefined,
		/** does the column NOT match the given POSIX regular expression, case sensitive */
		_nregex?: string | undefined,
		/** does the column NOT match the given SQL regular expression */
		_nsimilar?: string | undefined,
		/** does the column match the given POSIX regular expression, case sensitive */
		_regex?: string | undefined,
		/** does the column match the given SQL regular expression */
		_similar?: string | undefined
	};
	["bigint"]: "scalar" & { name: "bigint" };
	/** Boolean expression to compare columns of type "bigint". All fields are combined with logical 'AND'. */
	["bigint_comparison_exp"]: {
		_eq?: GraphQLTypes["bigint"] | undefined,
		_gt?: GraphQLTypes["bigint"] | undefined,
		_gte?: GraphQLTypes["bigint"] | undefined,
		_in?: Array<GraphQLTypes["bigint"]> | undefined,
		_is_null?: boolean | undefined,
		_lt?: GraphQLTypes["bigint"] | undefined,
		_lte?: GraphQLTypes["bigint"] | undefined,
		_neq?: GraphQLTypes["bigint"] | undefined,
		_nin?: Array<GraphQLTypes["bigint"]> | undefined
	};
	/** ordering argument of a cursor */
	["cursor_ordering"]: cursor_ordering;
	/** columns and relationships of "inscription" */
	["inscription"]: {
		__typename: "inscription",
		chain_id: string,
		content_hash: string,
		content_path: string,
		content_size_bytes: number,
		creator: string,
		current_owner: string,
		date_created: GraphQLTypes["timestamp"],
		height: number,
		id: number,
		metadata: GraphQLTypes["json"],
		transaction_hash: string,
		type: string,
		version: string
	};
	/** Boolean expression to filter rows from the table "inscription". All fields are combined with a logical 'AND'. */
	["inscription_bool_exp"]: {
		_and?: Array<GraphQLTypes["inscription_bool_exp"]> | undefined,
		_not?: GraphQLTypes["inscription_bool_exp"] | undefined,
		_or?: Array<GraphQLTypes["inscription_bool_exp"]> | undefined,
		chain_id?: GraphQLTypes["String_comparison_exp"] | undefined,
		content_hash?: GraphQLTypes["String_comparison_exp"] | undefined,
		content_path?: GraphQLTypes["String_comparison_exp"] | undefined,
		content_size_bytes?: GraphQLTypes["Int_comparison_exp"] | undefined,
		creator?: GraphQLTypes["String_comparison_exp"] | undefined,
		current_owner?: GraphQLTypes["String_comparison_exp"] | undefined,
		date_created?: GraphQLTypes["timestamp_comparison_exp"] | undefined,
		height?: GraphQLTypes["Int_comparison_exp"] | undefined,
		id?: GraphQLTypes["Int_comparison_exp"] | undefined,
		metadata?: GraphQLTypes["json_comparison_exp"] | undefined,
		transaction_hash?: GraphQLTypes["String_comparison_exp"] | undefined,
		type?: GraphQLTypes["String_comparison_exp"] | undefined,
		version?: GraphQLTypes["String_comparison_exp"] | undefined
	};
	/** Ordering options when selecting data from "inscription". */
	["inscription_order_by"]: {
		chain_id?: GraphQLTypes["order_by"] | undefined,
		content_hash?: GraphQLTypes["order_by"] | undefined,
		content_path?: GraphQLTypes["order_by"] | undefined,
		content_size_bytes?: GraphQLTypes["order_by"] | undefined,
		creator?: GraphQLTypes["order_by"] | undefined,
		current_owner?: GraphQLTypes["order_by"] | undefined,
		date_created?: GraphQLTypes["order_by"] | undefined,
		height?: GraphQLTypes["order_by"] | undefined,
		id?: GraphQLTypes["order_by"] | undefined,
		metadata?: GraphQLTypes["order_by"] | undefined,
		transaction_hash?: GraphQLTypes["order_by"] | undefined,
		type?: GraphQLTypes["order_by"] | undefined,
		version?: GraphQLTypes["order_by"] | undefined
	};
	/** select columns of table "inscription" */
	["inscription_select_column"]: inscription_select_column;
	/** Streaming cursor of the table "inscription" */
	["inscription_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: GraphQLTypes["inscription_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: GraphQLTypes["cursor_ordering"] | undefined
	};
	/** Initial value of the column from where the streaming should start */
	["inscription_stream_cursor_value_input"]: {
		chain_id?: string | undefined,
		content_hash?: string | undefined,
		content_path?: string | undefined,
		content_size_bytes?: number | undefined,
		creator?: string | undefined,
		current_owner?: string | undefined,
		date_created?: GraphQLTypes["timestamp"] | undefined,
		height?: number | undefined,
		id?: number | undefined,
		metadata?: GraphQLTypes["json"] | undefined,
		transaction_hash?: string | undefined,
		type?: string | undefined,
		version?: string | undefined
	};
	["json"]: "scalar" & { name: "json" };
	/** Boolean expression to compare columns of type "json". All fields are combined with logical 'AND'. */
	["json_comparison_exp"]: {
		_eq?: GraphQLTypes["json"] | undefined,
		_gt?: GraphQLTypes["json"] | undefined,
		_gte?: GraphQLTypes["json"] | undefined,
		_in?: Array<GraphQLTypes["json"]> | undefined,
		_is_null?: boolean | undefined,
		_lt?: GraphQLTypes["json"] | undefined,
		_lte?: GraphQLTypes["json"] | undefined,
		_neq?: GraphQLTypes["json"] | undefined,
		_nin?: Array<GraphQLTypes["json"]> | undefined
	};
	/** column ordering options */
	["order_by"]: order_by;
	["query_root"]: {
		__typename: "query_root",
		/** fetch data from the table: "inscription" */
		inscription: Array<GraphQLTypes["inscription"]>,
		/** fetch data from the table: "inscription" using primary key columns */
		inscription_by_pk?: GraphQLTypes["inscription"] | undefined,
		/** fetch data from the table: "status" */
		status: Array<GraphQLTypes["status"]>,
		/** fetch data from the table: "status" using primary key columns */
		status_by_pk?: GraphQLTypes["status"] | undefined,
		/** fetch data from the table: "token" */
		token: Array<GraphQLTypes["token"]>,
		/** fetch data from the table: "token" using primary key columns */
		token_by_pk?: GraphQLTypes["token"] | undefined,
		/** fetch data from the table: "transaction" */
		transaction: Array<GraphQLTypes["transaction"]>,
		/** fetch data from the table: "transaction" using primary key columns */
		transaction_by_pk?: GraphQLTypes["transaction"] | undefined
	};
	["smallint"]: "scalar" & { name: "smallint" };
	/** Boolean expression to compare columns of type "smallint". All fields are combined with logical 'AND'. */
	["smallint_comparison_exp"]: {
		_eq?: GraphQLTypes["smallint"] | undefined,
		_gt?: GraphQLTypes["smallint"] | undefined,
		_gte?: GraphQLTypes["smallint"] | undefined,
		_in?: Array<GraphQLTypes["smallint"]> | undefined,
		_is_null?: boolean | undefined,
		_lt?: GraphQLTypes["smallint"] | undefined,
		_lte?: GraphQLTypes["smallint"] | undefined,
		_neq?: GraphQLTypes["smallint"] | undefined,
		_nin?: Array<GraphQLTypes["smallint"]> | undefined
	};
	/** columns and relationships of "status" */
	["status"]: {
		__typename: "status",
		chain_id: string,
		date_updated: GraphQLTypes["timestamp"],
		id: number,
		last_processed_height: number
	};
	/** Boolean expression to filter rows from the table "status". All fields are combined with a logical 'AND'. */
	["status_bool_exp"]: {
		_and?: Array<GraphQLTypes["status_bool_exp"]> | undefined,
		_not?: GraphQLTypes["status_bool_exp"] | undefined,
		_or?: Array<GraphQLTypes["status_bool_exp"]> | undefined,
		chain_id?: GraphQLTypes["String_comparison_exp"] | undefined,
		date_updated?: GraphQLTypes["timestamp_comparison_exp"] | undefined,
		id?: GraphQLTypes["Int_comparison_exp"] | undefined,
		last_processed_height?: GraphQLTypes["Int_comparison_exp"] | undefined
	};
	/** Ordering options when selecting data from "status". */
	["status_order_by"]: {
		chain_id?: GraphQLTypes["order_by"] | undefined,
		date_updated?: GraphQLTypes["order_by"] | undefined,
		id?: GraphQLTypes["order_by"] | undefined,
		last_processed_height?: GraphQLTypes["order_by"] | undefined
	};
	/** select columns of table "status" */
	["status_select_column"]: status_select_column;
	/** Streaming cursor of the table "status" */
	["status_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: GraphQLTypes["status_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: GraphQLTypes["cursor_ordering"] | undefined
	};
	/** Initial value of the column from where the streaming should start */
	["status_stream_cursor_value_input"]: {
		chain_id?: string | undefined,
		date_updated?: GraphQLTypes["timestamp"] | undefined,
		id?: number | undefined,
		last_processed_height?: number | undefined
	};
	["subscription_root"]: {
		__typename: "subscription_root",
		/** fetch data from the table: "inscription" */
		inscription: Array<GraphQLTypes["inscription"]>,
		/** fetch data from the table: "inscription" using primary key columns */
		inscription_by_pk?: GraphQLTypes["inscription"] | undefined,
		/** fetch data from the table in a streaming manner: "inscription" */
		inscription_stream: Array<GraphQLTypes["inscription"]>,
		/** fetch data from the table: "status" */
		status: Array<GraphQLTypes["status"]>,
		/** fetch data from the table: "status" using primary key columns */
		status_by_pk?: GraphQLTypes["status"] | undefined,
		/** fetch data from the table in a streaming manner: "status" */
		status_stream: Array<GraphQLTypes["status"]>,
		/** fetch data from the table: "token" */
		token: Array<GraphQLTypes["token"]>,
		/** fetch data from the table: "token" using primary key columns */
		token_by_pk?: GraphQLTypes["token"] | undefined,
		/** fetch data from the table in a streaming manner: "token" */
		token_stream: Array<GraphQLTypes["token"]>,
		/** fetch data from the table: "transaction" */
		transaction: Array<GraphQLTypes["transaction"]>,
		/** fetch data from the table: "transaction" using primary key columns */
		transaction_by_pk?: GraphQLTypes["transaction"] | undefined,
		/** fetch data from the table in a streaming manner: "transaction" */
		transaction_stream: Array<GraphQLTypes["transaction"]>
	};
	["timestamp"]: "scalar" & { name: "timestamp" };
	/** Boolean expression to compare columns of type "timestamp". All fields are combined with logical 'AND'. */
	["timestamp_comparison_exp"]: {
		_eq?: GraphQLTypes["timestamp"] | undefined,
		_gt?: GraphQLTypes["timestamp"] | undefined,
		_gte?: GraphQLTypes["timestamp"] | undefined,
		_in?: Array<GraphQLTypes["timestamp"]> | undefined,
		_is_null?: boolean | undefined,
		_lt?: GraphQLTypes["timestamp"] | undefined,
		_lte?: GraphQLTypes["timestamp"] | undefined,
		_neq?: GraphQLTypes["timestamp"] | undefined,
		_nin?: Array<GraphQLTypes["timestamp"]> | undefined
	};
	/** columns and relationships of "token" */
	["token"]: {
		__typename: "token",
		chain_id: string,
		content_path?: string | undefined,
		content_size_bytes?: number | undefined,
		creator: string,
		current_owner: string,
		date_created: GraphQLTypes["timestamp"],
		decimals: GraphQLTypes["smallint"],
		height: number,
		id: number,
		launch_timestamp: GraphQLTypes["bigint"],
		max_supply: GraphQLTypes["bigint"],
		metadata?: string | undefined,
		mint_page: string,
		name: string,
		per_wallet_limit: GraphQLTypes["bigint"],
		ticker: string,
		transaction_hash: string,
		version: string
	};
	/** Boolean expression to filter rows from the table "token". All fields are combined with a logical 'AND'. */
	["token_bool_exp"]: {
		_and?: Array<GraphQLTypes["token_bool_exp"]> | undefined,
		_not?: GraphQLTypes["token_bool_exp"] | undefined,
		_or?: Array<GraphQLTypes["token_bool_exp"]> | undefined,
		chain_id?: GraphQLTypes["String_comparison_exp"] | undefined,
		content_path?: GraphQLTypes["String_comparison_exp"] | undefined,
		content_size_bytes?: GraphQLTypes["Int_comparison_exp"] | undefined,
		creator?: GraphQLTypes["String_comparison_exp"] | undefined,
		current_owner?: GraphQLTypes["String_comparison_exp"] | undefined,
		date_created?: GraphQLTypes["timestamp_comparison_exp"] | undefined,
		decimals?: GraphQLTypes["smallint_comparison_exp"] | undefined,
		height?: GraphQLTypes["Int_comparison_exp"] | undefined,
		id?: GraphQLTypes["Int_comparison_exp"] | undefined,
		launch_timestamp?: GraphQLTypes["bigint_comparison_exp"] | undefined,
		max_supply?: GraphQLTypes["bigint_comparison_exp"] | undefined,
		metadata?: GraphQLTypes["String_comparison_exp"] | undefined,
		mint_page?: GraphQLTypes["String_comparison_exp"] | undefined,
		name?: GraphQLTypes["String_comparison_exp"] | undefined,
		per_wallet_limit?: GraphQLTypes["bigint_comparison_exp"] | undefined,
		ticker?: GraphQLTypes["String_comparison_exp"] | undefined,
		transaction_hash?: GraphQLTypes["String_comparison_exp"] | undefined,
		version?: GraphQLTypes["String_comparison_exp"] | undefined
	};
	/** Ordering options when selecting data from "token". */
	["token_order_by"]: {
		chain_id?: GraphQLTypes["order_by"] | undefined,
		content_path?: GraphQLTypes["order_by"] | undefined,
		content_size_bytes?: GraphQLTypes["order_by"] | undefined,
		creator?: GraphQLTypes["order_by"] | undefined,
		current_owner?: GraphQLTypes["order_by"] | undefined,
		date_created?: GraphQLTypes["order_by"] | undefined,
		decimals?: GraphQLTypes["order_by"] | undefined,
		height?: GraphQLTypes["order_by"] | undefined,
		id?: GraphQLTypes["order_by"] | undefined,
		launch_timestamp?: GraphQLTypes["order_by"] | undefined,
		max_supply?: GraphQLTypes["order_by"] | undefined,
		metadata?: GraphQLTypes["order_by"] | undefined,
		mint_page?: GraphQLTypes["order_by"] | undefined,
		name?: GraphQLTypes["order_by"] | undefined,
		per_wallet_limit?: GraphQLTypes["order_by"] | undefined,
		ticker?: GraphQLTypes["order_by"] | undefined,
		transaction_hash?: GraphQLTypes["order_by"] | undefined,
		version?: GraphQLTypes["order_by"] | undefined
	};
	/** select columns of table "token" */
	["token_select_column"]: token_select_column;
	/** Streaming cursor of the table "token" */
	["token_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: GraphQLTypes["token_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: GraphQLTypes["cursor_ordering"] | undefined
	};
	/** Initial value of the column from where the streaming should start */
	["token_stream_cursor_value_input"]: {
		chain_id?: string | undefined,
		content_path?: string | undefined,
		content_size_bytes?: number | undefined,
		creator?: string | undefined,
		current_owner?: string | undefined,
		date_created?: GraphQLTypes["timestamp"] | undefined,
		decimals?: GraphQLTypes["smallint"] | undefined,
		height?: number | undefined,
		id?: number | undefined,
		launch_timestamp?: GraphQLTypes["bigint"] | undefined,
		max_supply?: GraphQLTypes["bigint"] | undefined,
		metadata?: string | undefined,
		mint_page?: string | undefined,
		name?: string | undefined,
		per_wallet_limit?: GraphQLTypes["bigint"] | undefined,
		ticker?: string | undefined,
		transaction_hash?: string | undefined,
		version?: string | undefined
	};
	/** columns and relationships of "transaction" */
	["transaction"]: {
		__typename: "transaction",
		content: string,
		content_length: number,
		date_created: GraphQLTypes["timestamp"],
		fees: string,
		gas_used: number,
		hash: string,
		height: number,
		id: number,
		status_message?: string | undefined
	};
	/** Boolean expression to filter rows from the table "transaction". All fields are combined with a logical 'AND'. */
	["transaction_bool_exp"]: {
		_and?: Array<GraphQLTypes["transaction_bool_exp"]> | undefined,
		_not?: GraphQLTypes["transaction_bool_exp"] | undefined,
		_or?: Array<GraphQLTypes["transaction_bool_exp"]> | undefined,
		content?: GraphQLTypes["String_comparison_exp"] | undefined,
		content_length?: GraphQLTypes["Int_comparison_exp"] | undefined,
		date_created?: GraphQLTypes["timestamp_comparison_exp"] | undefined,
		fees?: GraphQLTypes["String_comparison_exp"] | undefined,
		gas_used?: GraphQLTypes["Int_comparison_exp"] | undefined,
		hash?: GraphQLTypes["String_comparison_exp"] | undefined,
		height?: GraphQLTypes["Int_comparison_exp"] | undefined,
		id?: GraphQLTypes["Int_comparison_exp"] | undefined,
		status_message?: GraphQLTypes["String_comparison_exp"] | undefined
	};
	/** Ordering options when selecting data from "transaction". */
	["transaction_order_by"]: {
		content?: GraphQLTypes["order_by"] | undefined,
		content_length?: GraphQLTypes["order_by"] | undefined,
		date_created?: GraphQLTypes["order_by"] | undefined,
		fees?: GraphQLTypes["order_by"] | undefined,
		gas_used?: GraphQLTypes["order_by"] | undefined,
		hash?: GraphQLTypes["order_by"] | undefined,
		height?: GraphQLTypes["order_by"] | undefined,
		id?: GraphQLTypes["order_by"] | undefined,
		status_message?: GraphQLTypes["order_by"] | undefined
	};
	/** select columns of table "transaction" */
	["transaction_select_column"]: transaction_select_column;
	/** Streaming cursor of the table "transaction" */
	["transaction_stream_cursor_input"]: {
		/** Stream column input with initial value */
		initial_value: GraphQLTypes["transaction_stream_cursor_value_input"],
		/** cursor ordering */
		ordering?: GraphQLTypes["cursor_ordering"] | undefined
	};
	/** Initial value of the column from where the streaming should start */
	["transaction_stream_cursor_value_input"]: {
		content?: string | undefined,
		content_length?: number | undefined,
		date_created?: GraphQLTypes["timestamp"] | undefined,
		fees?: string | undefined,
		gas_used?: number | undefined,
		hash?: string | undefined,
		height?: number | undefined,
		id?: number | undefined,
		status_message?: string | undefined
	}
}
/** ordering argument of a cursor */
export const enum cursor_ordering {
	ASC = "ASC",
	DESC = "DESC"
}
/** select columns of table "inscription" */
export const enum inscription_select_column {
	chain_id = "chain_id",
	content_hash = "content_hash",
	content_path = "content_path",
	content_size_bytes = "content_size_bytes",
	creator = "creator",
	current_owner = "current_owner",
	date_created = "date_created",
	height = "height",
	id = "id",
	metadata = "metadata",
	transaction_hash = "transaction_hash",
	type = "type",
	version = "version"
}
/** column ordering options */
export const enum order_by {
	asc = "asc",
	asc_nulls_first = "asc_nulls_first",
	asc_nulls_last = "asc_nulls_last",
	desc = "desc",
	desc_nulls_first = "desc_nulls_first",
	desc_nulls_last = "desc_nulls_last"
}
/** select columns of table "status" */
export const enum status_select_column {
	chain_id = "chain_id",
	date_updated = "date_updated",
	id = "id",
	last_processed_height = "last_processed_height"
}
/** select columns of table "token" */
export const enum token_select_column {
	chain_id = "chain_id",
	content_path = "content_path",
	content_size_bytes = "content_size_bytes",
	creator = "creator",
	current_owner = "current_owner",
	date_created = "date_created",
	decimals = "decimals",
	height = "height",
	id = "id",
	launch_timestamp = "launch_timestamp",
	max_supply = "max_supply",
	metadata = "metadata",
	mint_page = "mint_page",
	name = "name",
	per_wallet_limit = "per_wallet_limit",
	ticker = "ticker",
	transaction_hash = "transaction_hash",
	version = "version"
}
/** select columns of table "transaction" */
export const enum transaction_select_column {
	content = "content",
	content_length = "content_length",
	date_created = "date_created",
	fees = "fees",
	gas_used = "gas_used",
	hash = "hash",
	height = "height",
	id = "id",
	status_message = "status_message"
}

type ZEUS_VARIABLES = {
	["Int_comparison_exp"]: ValueTypes["Int_comparison_exp"];
	["String_comparison_exp"]: ValueTypes["String_comparison_exp"];
	["bigint"]: ValueTypes["bigint"];
	["bigint_comparison_exp"]: ValueTypes["bigint_comparison_exp"];
	["cursor_ordering"]: ValueTypes["cursor_ordering"];
	["inscription_bool_exp"]: ValueTypes["inscription_bool_exp"];
	["inscription_order_by"]: ValueTypes["inscription_order_by"];
	["inscription_select_column"]: ValueTypes["inscription_select_column"];
	["inscription_stream_cursor_input"]: ValueTypes["inscription_stream_cursor_input"];
	["inscription_stream_cursor_value_input"]: ValueTypes["inscription_stream_cursor_value_input"];
	["json"]: ValueTypes["json"];
	["json_comparison_exp"]: ValueTypes["json_comparison_exp"];
	["order_by"]: ValueTypes["order_by"];
	["smallint"]: ValueTypes["smallint"];
	["smallint_comparison_exp"]: ValueTypes["smallint_comparison_exp"];
	["status_bool_exp"]: ValueTypes["status_bool_exp"];
	["status_order_by"]: ValueTypes["status_order_by"];
	["status_select_column"]: ValueTypes["status_select_column"];
	["status_stream_cursor_input"]: ValueTypes["status_stream_cursor_input"];
	["status_stream_cursor_value_input"]: ValueTypes["status_stream_cursor_value_input"];
	["timestamp"]: ValueTypes["timestamp"];
	["timestamp_comparison_exp"]: ValueTypes["timestamp_comparison_exp"];
	["token_bool_exp"]: ValueTypes["token_bool_exp"];
	["token_order_by"]: ValueTypes["token_order_by"];
	["token_select_column"]: ValueTypes["token_select_column"];
	["token_stream_cursor_input"]: ValueTypes["token_stream_cursor_input"];
	["token_stream_cursor_value_input"]: ValueTypes["token_stream_cursor_value_input"];
	["transaction_bool_exp"]: ValueTypes["transaction_bool_exp"];
	["transaction_order_by"]: ValueTypes["transaction_order_by"];
	["transaction_select_column"]: ValueTypes["transaction_select_column"];
	["transaction_stream_cursor_input"]: ValueTypes["transaction_stream_cursor_input"];
	["transaction_stream_cursor_value_input"]: ValueTypes["transaction_stream_cursor_value_input"];
}