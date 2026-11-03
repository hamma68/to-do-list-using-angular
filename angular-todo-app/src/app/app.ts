import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Filter, Priority, Todo } from './todo.model';
import { TodoService } from './todo.service';
import { TITLE_MAX, TITLE_MIN, notBlank, notInPast, todayString, trimmedMinLength } from './validators';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly api = inject(TodoService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly TITLE_MAX = TITLE_MAX;
  protected readonly filters: Filter[] = ['all', 'active', 'completed'];
  protected readonly today = todayString();

  // ----- state -----
  protected readonly todos = signal<Todo[]>([]);
  protected readonly filter = signal<Filter>('all');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);

  protected readonly visibleTodos = computed(() => {
    const list = this.todos();
    switch (this.filter()) {
      case 'active':
        return list.filter((t) => !t.completed);
      case 'completed':
        return list.filter((t) => t.completed);
      default:
        return list;
    }
  });
  protected readonly remaining = computed(() => this.todos().filter((t) => !t.completed).length);
  protected readonly completedCount = computed(() => this.todos().length - this.remaining());

  // ----- forms + validation -----
  private readonly titleValidators = [
    Validators.required,
    notBlank,
    trimmedMinLength(TITLE_MIN),
    Validators.maxLength(TITLE_MAX),
  ];

  protected readonly form = this.fb.group({
    title: this.fb.control('', this.titleValidators),
    priority: this.fb.control<Priority>('medium'),
    dueDate: this.fb.control('', [notInPast]),
  });

  protected readonly editControl = this.fb.control('', this.titleValidators);

  ngOnInit(): void {
    this.load();
  }

  // ----- API actions -----
  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (todos) => {
        this.todos.set(todos);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load todos. Is the API running?');
      },
    });
  }

  protected add(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.api.create({ title: v.title.trim(), priority: v.priority, dueDate: v.dueDate || null }).subscribe({
      next: (todo) => {
        this.todos.update((list) => [todo, ...list]);
        this.form.reset({ title: '', priority: 'medium', dueDate: '' });
        this.saving.set(false);
      },
      error: (e: HttpErrorResponse) => this.handleError(e, true),
    });
  }

  protected toggle(todo: Todo): void {
    this.api.setCompleted(todo.id, !todo.completed).subscribe({
      next: (updated) => this.replace(updated),
      error: (e: HttpErrorResponse) => this.handleError(e),
    });
  }

  protected remove(todo: Todo): void {
    this.api.remove(todo.id).subscribe({
      next: () => this.todos.update((list) => list.filter((t) => t.id !== todo.id)),
      error: (e: HttpErrorResponse) => this.handleError(e),
    });
  }

  protected clearCompleted(): void {
    this.api.clearCompleted().subscribe({
      next: () => this.todos.update((list) => list.filter((t) => !t.completed)),
      error: (e: HttpErrorResponse) => this.handleError(e),
    });
  }

  // ----- inline editing -----
  protected startEdit(todo: Todo): void {
    this.editControl.reset(todo.title);
    this.editingId.set(todo.id);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected saveEdit(todo: Todo): void {
    if (this.editControl.invalid) {
      this.editControl.markAsTouched();
      return;
    }
    this.api
      .update(todo.id, { title: this.editControl.value.trim(), priority: todo.priority, dueDate: todo.dueDate })
      .subscribe({
        next: (updated) => {
          this.replace(updated);
          this.editingId.set(null);
        },
        error: (e: HttpErrorResponse) => this.handleError(e, false),
      });
  }

  // ----- helpers used by the template -----
  protected showError(c: AbstractControl): boolean {
    return c.invalid && (c.touched || c.dirty);
  }

  protected message(c: AbstractControl): string {
    const e = c.errors;
    if (!e) return '';
    if (e['server']) return e['server'];
    if (e['required'] || e['blank']) return 'Title is required.';
    if (e['minTrimmed']) return `Title must be at least ${e['minTrimmed'].requiredLength} characters.`;
    if (e['maxlength']) return `Title must be at most ${e['maxlength'].requiredLength} characters.`;
    if (e['pastDate']) return 'Due date cannot be in the past.';
    return 'Invalid value.';
  }

  protected isOverdue(todo: Todo): boolean {
    return !todo.completed && !!todo.dueDate && todo.dueDate < this.today;
  }

  protected trimmedLength(value: string): number {
    return value.trim().length;
  }

  private replace(updated: Todo): void {
    this.todos.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
  }

  /** Maps backend validation errors (400) onto the form; other errors go to a banner. */
  private handleError(e: HttpErrorResponse, addForm = false): void {
    this.saving.set(false);
    const errors = e.status === 400 ? (e.error?.errors as Record<string, string> | undefined) : undefined;
    if (errors) {
      const target: Record<string, AbstractControl> = addForm
        ? { title: this.form.controls.title, dueDate: this.form.controls.dueDate, priority: this.form.controls.priority }
        : { title: this.editControl };
      let mapped = false;
      for (const [field, msg] of Object.entries(errors)) {
        const control = target[field];
        if (control) {
          control.setErrors({ server: msg });
          control.markAsTouched();
          mapped = true;
        }
      }
      if (mapped) return;
      this.error.set(Object.values(errors).join(' '));
    } else if (e.status === 404) {
      this.error.set('That task no longer exists. Refreshing…');
      this.load();
    } else {
      this.error.set('Could not reach the server. Please try again.');
    }
  }
}
