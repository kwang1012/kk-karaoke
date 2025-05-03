import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import themeReducer from './theme';
import localReducer from './local';
import settingReducer from './setting';

const persistConfig = {
  key: 'root',
  storage,
};

const persistedReducer = persistReducer(
  persistConfig,
  combineReducers({ theme: themeReducer, local: localReducer, setting: settingReducer })
);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
