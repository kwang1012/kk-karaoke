import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store, persistor, RootState } from 'src/store';
import { PersistGate } from 'redux-persist/integration/react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Home } from '@mui/icons-material';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<h1>Loading...</h1>} persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
