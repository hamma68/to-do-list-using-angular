import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, retry } from 'rxjs';
import { Todo, TodoInput } from './todo.model';

@Injectable({ providedIn: 'root' })
export class TodoService {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/todos';

  list(): Observable<Todo[]> {
    // Retry a few times: on StackBlitz the API can come up a moment after the web app.
    return this.http.get<Todo[]>(this.url).pipe(retry({ count: 4, delay: 1000 }));
  }

  create(input: TodoInput): Observable<Todo> {
    return this.http.post<Todo>(this.url, input);
  }

  update(id: string, input: TodoInput): Observable<Todo> {
    return this.http.put<Todo>(`${this.url}/${id}`, input);
  }

  setCompleted(id: string, completed: boolean): Observable<Todo> {
    return this.http.patch<Todo>(`${this.url}/${id}`, { completed });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  clearCompleted(): Observable<void> {
    return this.http.delete<void>(`${this.url}?completed=true`);
  }
}
